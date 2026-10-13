"""
Local face-recognition microservice for the Bus Fee Check system.

Runs 100% on the laptop with DeepFace - no cloud APIs, no API keys, no cost.

Light setup by design:
  * embedding model  : SFace  (OpenCV ONNX, 128-d, CPU only, ~37 MB one-time cache)
  * face detector    : YuNet  (OpenCV DNN, ~230 KB one-time cache)
  * no TensorFlow / PyTorch / GPU required

Model weights are fetched once by DeepFace into ~/.deepface/weights and then
everything runs fully offline.

Endpoints
---------
GET  /health        service, model and MongoDB status
POST /face/detect   is somebody in front of the camera? (YuNet only, no match)
POST /face/match    match a webcam frame against every registered student face
POST /face/register compute + store an embedding for one student

Run
---
    python main.py            # or: python -m uvicorn main:app --port 8000
"""

import base64
import os
import re
import sys
import time
import uuid
from importlib import metadata as importlib_metadata
from pathlib import Path
from typing import List, Optional

# deepface logs with emoji - make sure the Windows console can print them
for _stream in (sys.stdout, sys.stderr):
    if _stream is not None and hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

import cv2
import numpy as np
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pymongo import MongoClient
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# deepface runs SFace/OpenCV without any heavyweight ML framework. deepface
# refuses to start when neither tensorflow nor pytorch is installed, so we
# point it at its backend-agnostic "any" engine - SFace is registered there.
# ---------------------------------------------------------------------------
from deepface.commons import backend_utils

if not (
    backend_utils.is_backend_available(backend_utils.TENSORFLOW)
    or backend_utils.is_backend_available(backend_utils.PYTORCH)
):
    backend_utils.get_backend_engine = lambda: "any"  # type: ignore[assignment]

from deepface import DeepFace
from deepface.config.threshold import thresholds as deepface_thresholds
from deepface.modules.exceptions import FaceNotDetected

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")
load_dotenv(BASE_DIR.parent / "backend" / ".env")  # reuse MONGODB_URI


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
def _db_name(uri: str, fallback: str = "bus-fee-system") -> str:
    try:
        name = uri.rsplit("/", 1)[-1].split("?")[0]
        return name or fallback
    except Exception:
        return fallback


def _default_threshold(model_name: str) -> float:
    """DeepFace stores thresholds as cosine *distance*; we compare similarity."""
    entry = deepface_thresholds.get(model_name)
    if entry and "cosine" in entry:
        return round(1.0 - float(entry["cosine"]), 3)
    return 0.7


MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/bus-fee-system")
DB_NAME = os.getenv("MONGODB_DB") or _db_name(MONGODB_URI)
MODEL_NAME = os.getenv("FACE_MODEL", "SFace")
DETECTOR_BACKEND = os.getenv("FACE_DETECTOR", "yunet")
MAX_FRAME_WIDTH = int(os.getenv("FACE_MAX_FRAME_WIDTH", "960"))

_env_threshold = os.getenv("FACE_MATCH_THRESHOLD", "").strip()
MATCH_THRESHOLD = float(_env_threshold) if _env_threshold else _default_threshold(MODEL_NAME)
# set to false only for demos/tests with images that contain no detectable face
ENFORCE_DETECTION = os.getenv("FACE_ENFORCE_DETECTION", "true").strip().lower() not in ("0", "false", "no")

# YuNet reads this on every detect() call. 0.9 is the library default and it is far too
# strict for a webcam - it is what produced the repeated "no face" scans.
YUNET_SCORE = (
    os.getenv("YUNET_SCORE_THRESHOLD", "").strip()
    or os.environ.get("yunet_score_threshold", "").strip()
    or "0.6"
)
os.environ["yunet_score_threshold"] = YUNET_SCORE

# detection quality gate - frames below this YuNet score are discarded (whole-image
# fallbacks report 0, so they are dropped too)
MIN_DET_CONF = 0.0 if not ENFORCE_DETECTION else float(os.getenv("FACE_MIN_DET_CONF", YUNET_SCORE))
# Laplacian variance of the face crop; low = motion blurred / out of focus frame
MIN_BLUR = float(os.getenv("FACE_MIN_BLUR", "25"))
# pad the detected box before cropping - SFace is sensitive to tight crops
EXPAND_PCT = int(os.getenv("FACE_EXPAND_PERCENTAGE", "15"))
# best-vs-runner-up cosine gap required to accept a match (kills near-ties)
MIN_MARGIN = float(os.getenv("FACE_MIN_MARGIN", "0.04"))
# frames per scan / per enrollment, and how many templates are kept per student
MAX_FRAMES = max(1, int(os.getenv("FACE_MAX_FRAMES", "5")))
MAX_TEMPLATES = max(1, int(os.getenv("FACE_MAX_TEMPLATES", "4")))
TEMPLATE_DEDUP = float(os.getenv("FACE_TEMPLATE_DEDUP", "0.97"))
# re-read + re-normalise the Mongo gallery at most this often (0 = every scan)
GALLERY_TTL_MS = int(os.getenv("FACE_GALLERY_TTL_MS", "3000"))

HOST = os.getenv("AI_SERVICE_HOST", "127.0.0.1")
PORT = int(os.getenv("AI_SERVICE_PORT", "8000"))
FACES_DIR = Path(
    os.getenv("FACE_UPLOAD_DIR", str(BASE_DIR.parent / "backend" / "uploads" / "faces"))
)

mongo = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=4000)
students = mongo[DB_NAME]["students"]

app = FastAPI(title="Bus Fee Check - Local Face Recognition Service", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------
class ImageRequest(BaseModel):
    image: Optional[str] = Field(None, description="single base64 webcam frame")
    images: Optional[List[str]] = Field(
        None, description="2-5 consecutive webcam frames (fused into one query vector)"
    )
    top_k: int = Field(3, ge=1, le=10, description="How many candidate matches to return")


class RegisterRequest(ImageRequest):
    student_id: str


class DetectRequest(BaseModel):
    image: str = Field(..., description="base64 webcam frame (data URL or raw base64)")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _decode_one(data: str) -> Optional[np.ndarray]:
    """base64 -> BGR frame (downscaled). Returns None when the payload is unusable."""
    if data.startswith("data:"):
        data = data.split(",", 1)[-1]
    try:
        raw = base64.b64decode(data)
        frame = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    except Exception:
        return None
    if frame is None or frame.size == 0:
        return None
    if MAX_FRAME_WIDTH and frame.shape[1] > MAX_FRAME_WIDTH:
        # shrink oversized frames: detection stays accurate, CPU cost drops
        scale = MAX_FRAME_WIDTH / float(frame.shape[1])
        frame = cv2.resize(frame, (MAX_FRAME_WIDTH, max(1, int(frame.shape[0] * scale))))
    return frame


def decode_frames(req: ImageRequest) -> List[np.ndarray]:
    payloads = [x for x in (req.images or []) if isinstance(x, str) and x.strip()]
    if not payloads and isinstance(req.image, str) and req.image.strip():
        payloads = [req.image]
    payloads = payloads[:MAX_FRAMES]

    frames = []
    for payload in payloads:
        frame = _decode_one(payload)
        if frame is not None:
            frames.append(frame)
    if not frames:
        raise HTTPException(
            status_code=400,
            detail={"code": "bad_image", "message": "Frame is not a decodable image"},
        )
    return frames


def _sharpness(frame: np.ndarray, area: dict) -> float:
    """Laplacian variance of the detected face crop - higher is sharper."""
    try:
        x, y = int(area.get("x", 0)), int(area.get("y", 0))
        w, h = int(area.get("w", 0)), int(area.get("h", 0))
        if w <= 0 or h <= 0:
            return 0.0
        pad = int(0.1 * max(w, h))
        crop = frame[max(0, y - pad): y + h + pad, max(0, x - pad): x + w + pad]
        if crop.size == 0:
            return 0.0
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        return float(cv2.Laplacian(gray, cv2.CV_64F).var())
    except Exception:
        return 0.0


def _unit(vec) -> Optional[np.ndarray]:
    arr = np.asarray(vec, dtype=np.float32)
    if arr.ndim != 1 or arr.size == 0:
        return None
    n = float(np.linalg.norm(arr))
    if n == 0:
        return None
    return arr / n


def embed_frames(frames: List[np.ndarray]):
    """Embed 1..N frames in a single batched SFace pass.

    Returns (unit query vector, [(unit vec, weight), ...], stats). The query is the
    detection-confidence x sharpness weighted mean of every usable frame, which is far
    steadier than a single grab. Raises 422 when no usable face is in any frame.
    """
    try:
        reps = DeepFace.represent(
            img_path=list(frames),
            model_name=MODEL_NAME,
            detector_backend=DETECTOR_BACKEND,
            # batch-safe: instead of aborting on one bad frame we filter on the
            # detector score below (whole-image fallbacks report face_confidence 0)
            enforce_detection=False,
            align=True,
            expand_percentage=EXPAND_PCT,
            max_faces=1,
        )
    except (FaceNotDetected, ValueError) as exc:
        raise HTTPException(
            status_code=422,
            detail={"code": "no_face", "message": str(exc) or "No face detected in the frame"},
        )
    except HTTPException:
        raise
    except Exception as exc:  # model load / inference failure
        raise HTTPException(
            status_code=500,
            detail={"code": "inference_error", "message": f"{type(exc).__name__}: {exc}"},
        )

    # single image in -> flat list of dicts; several images in -> list of lists
    groups = [reps] if len(frames) == 1 else reps

    sharp_ref = max(MIN_BLUR * 2.0, 1.0)
    usable = []
    for idx, frame in enumerate(frames):
        group = groups[idx] if idx < len(groups) else []
        if not group:
            continue
        rep = group[0]
        det = float(rep.get("face_confidence") or 0.0)
        if det < MIN_DET_CONF:
            continue
        vec = _unit(rep.get("embedding"))
        if vec is None:
            continue
        sharp = _sharpness(frame, rep.get("facial_area") or {})
        weight = det * min(1.0, sharp / sharp_ref)
        usable.append((vec, max(weight, 1e-3), sharp, det))

    if not usable:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "no_face",
                "message": f"No face detected in the {len(frames)} frame(s) sent",
            },
        )

    stacked = np.stack([v for v, _, _, _ in usable])
    weights = np.asarray([w for _, w, _, _ in usable], dtype=np.float32)
    query = stacked.T @ weights
    n = float(np.linalg.norm(query))
    if n == 0:
        raise HTTPException(status_code=500, detail={"code": "inference_error", "message": "Empty embedding"})
    query = query / n

    stats = {
        "frames_used": len(usable),
        "frames_total": len(frames),
        "avg_sharpness": round(sum(s for _, _, s, _ in usable) / len(usable), 1),
        "avg_det_confidence": round(sum(d for _, _, _, d in usable) / len(usable), 3),
    }
    return query, [(v, w) for v, w, _, _ in usable], stats


def _candidate(doc: dict, confidence: float) -> dict:
    return {
        "student_id": str(doc["_id"]),
        "student_code": doc.get("studentId"),
        "name": " ".join(x for x in (doc.get("firstName"), doc.get("lastName")) if x).strip(),
        "payment_status": doc.get("paymentStatus"),
        "confidence": round(confidence, 4),
    }


# ---------------------------------------------------------------------------
# Gallery cache - normalised vectors are rebuilt at most every GALLERY_TTL_MS
# instead of on every scan (Mongo read + L2 norm of the whole roster).
# ---------------------------------------------------------------------------
_GALLERY = {"at": 0.0, "loaded": False, "dim": 0, "matrix": None, "owners": None, "docs": []}


def _templates_of(doc: dict) -> List[list]:
    """Every stored embedding for a student: faceData.templates (n x 128) or the
    legacy single faceData.embeddings (128)."""
    face = doc.get("faceData") or {}
    for key in ("templates", "embeddings"):
        raw = face.get(key)
        if not raw:
            continue
        if isinstance(raw[0], (list, tuple)):
            return [list(t) for t in raw]
        return [list(raw)]
    return []


def _gallery(dim: int):
    """Return (matrix [R x D], owners [R], docs) where every row belongs to the
    student docs[owners[i]]. Cached for GALLERY_TTL_MS."""
    now = time.monotonic() * 1000.0
    if (
        _GALLERY["loaded"]
        and _GALLERY["dim"] == dim
        and GALLERY_TTL_MS > 0
        and now - _GALLERY["at"] < GALLERY_TTL_MS
    ):
        return _GALLERY["matrix"], _GALLERY["owners"], _GALLERY["docs"]

    try:
        docs = [
            d
            for d in students.find(
                {"faceRegistrationStatus": "registered"},
                {
                    "faceData.templates": 1,
                    "faceData.embeddings": 1,
                    "firstName": 1,
                    "lastName": 1,
                    "studentId": 1,
                    "paymentStatus": 1,
                },
            )
            if (d.get("faceData") or {}).get("templates") or (d.get("faceData") or {}).get("embeddings")
        ]
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "db_unavailable",
                "message": f"MongoDB is not reachable from the AI service: {exc}",
            },
        ) from exc

    rows, owners, valid = [], [], []
    for doc in docs:
        vectors = []
        for raw in _templates_of(doc):
            vec = _unit(raw)
            if vec is None or vec.size != dim:
                # a corrupted/legacy embedding must never break the whole scan
                logger.warning("skipping bad embedding for student %s", doc.get("studentId"))
                continue
            vectors.append(vec)
        if not vectors:
            continue
        owner = len(valid)
        valid.append(doc)
        rows.extend(vectors)
        owners.extend([owner] * len(vectors))

    matrix = np.stack(rows) if rows else None
    _GALLERY.update(
        at=now,
        loaded=True,
        dim=dim,
        matrix=matrix,
        owners=np.asarray(owners, dtype=np.int64) if rows else None,
        docs=valid,
    )
    return _GALLERY["matrix"], _GALLERY["owners"], _GALLERY["docs"]


def _internal_error(exc: Exception) -> HTTPException:
    """Turn any unexpected failure into a JSON 500 the Node backend can read."""
    logger.exception("face service failure")
    return HTTPException(
        status_code=500,
        detail={"code": "internal_error", "message": f"{type(exc).__name__}: {exc}"},
    )


import logging

logger = logging.getLogger("face-service")
if not logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    logger.addHandler(_handler)
logger.setLevel(logging.INFO)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request, exc):  # noqa: ANN001
    """Never fall back to Starlette's plain-text 500 - always answer with JSON."""
    logger.exception("unhandled error on %s %s", request.method, request.url.path)
    from fastapi.responses import JSONResponse

    return JSONResponse(
        status_code=500,
        content={"detail": {"code": "internal_error", "message": f"{type(exc).__name__}: {exc}"}},
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    try:
        mongo.admin.command("ping")
        mongo_ok = True
    except Exception:
        mongo_ok = False
    try:
        version = importlib_metadata.version("deepface")
    except Exception:
        version = "unknown"
    return {
        "status": "ok",
        "model": MODEL_NAME,
        "detector": DETECTOR_BACKEND,
        "threshold": MATCH_THRESHOLD,
        "margin": MIN_MARGIN,
        "detector_score": float(YUNET_SCORE),
        "max_frames": MAX_FRAMES,
        "mongodb": mongo_ok,
        "deepface": version,
    }


@app.post("/face/detect")
def detect(req: DetectRequest):
    """Presence check for the auto-scan loop: YuNet only - no embedding, no
    MongoDB, no log, no match. The frontend polls this about once a second and
    only calls /face/match when somebody is actually standing in front of it."""
    started = time.perf_counter()
    frame = _decode_one(req.image)
    if frame is None:
        raise HTTPException(
            status_code=400,
            detail={"code": "bad_image", "message": "Frame is not a decodable image"},
        )
    try:
        faces = DeepFace.extract_faces(
            img_path=frame,
            detector_backend=DETECTOR_BACKEND,
            enforce_detection=False,
            align=False,
            expand_percentage=0,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail={"code": "inference_error", "message": f"{type(exc).__name__}: {exc}"},
        )

    # with enforce_detection=False a miss comes back as the whole image with
    # confidence 0, so counting real detections is just a score filter
    count = sum(1 for f in faces if float(f.get("confidence") or 0.0) >= MIN_DET_CONF)
    return {
        "face_count": count,
        "detector": DETECTOR_BACKEND,
        "detector_score": float(YUNET_SCORE),
        "processing_time_ms": int((time.perf_counter() - started) * 1000),
    }


@app.post("/face/match")
def match(req: ImageRequest):
    try:
        return _match_impl(req)
    except HTTPException:
        raise
    except Exception as exc:
        raise _internal_error(exc) from exc


def _match_impl(req: ImageRequest):
    started = time.perf_counter()
    frames = decode_frames(req)
    query, _per_frame, stats = embed_frames(frames)
    matrix, owners, docs = _gallery(query.size)

    elapsed = int((time.perf_counter() - started) * 1000)
    base = {
        "model": MODEL_NAME,
        "threshold": MATCH_THRESHOLD,
        "processing_time_ms": elapsed,
        "face_count": stats["frames_used"],
        "database_size": len(docs),
        **stats,
    }

    if matrix is None or not docs:
        return {**base, "matched": False, "confidence": 0.0, "best": None, "candidates": [], "reason": "no_faces_registered"}

    # cosine similarity of the query against every template, max-pooled per student
    sims = matrix @ query
    per_doc = np.full(len(docs), -1.0, dtype=np.float32)
    np.maximum.at(per_doc, owners, sims)

    order = np.argsort(per_doc)[::-1][: max(req.top_k, 1)]
    ranked = [int(i) for i in order]
    candidates = [
        _candidate(docs[i], float(min(max(per_doc[i], 0.0), 1.0))) for i in ranked
    ]

    confidence = float(min(max(per_doc[ranked[0]], 0.0), 1.0))
    runner_up = float(per_doc[ranked[1]]) if len(ranked) > 1 else -1.0
    margin = float(min(max(confidence - runner_up, 0.0), 1.0))

    if confidence < MATCH_THRESHOLD:
        reason = "below_threshold"
    elif margin < MIN_MARGIN:
        reason = "ambiguous"
    else:
        reason = "matched"

    return {
        **base,
        "matched": reason == "matched",
        "confidence": round(confidence, 4),
        "margin": round(margin, 4),
        "best": candidates[0] if candidates else None,
        "candidates": candidates,
        "reason": reason,
    }


@app.post("/face/register")
def register(req: RegisterRequest):
    try:
        return _register_impl(req)
    except HTTPException:
        raise
    except Exception as exc:
        raise _internal_error(exc) from exc


def _register_impl(req: RegisterRequest):
    frames = decode_frames(req)
    embedding, per_frame, stats = embed_frames(frames)

    # keep a few distinct templates instead of one grab - matching then takes the
    # best hit across them, which is the single biggest accuracy lever
    templates = [embedding]
    for vec, _weight in sorted(per_frame, key=lambda item: -item[1]):
        if len(templates) >= MAX_TEMPLATES:
            break
        if all(float(vec @ np.asarray(t, dtype=np.float32)) < TEMPLATE_DEDUP for t in templates):
            templates.append(vec)
    template_list = [[round(float(v), 8) for v in t] for t in templates]

    FACES_DIR.mkdir(parents=True, exist_ok=True)
    safe_id = re.sub(r"[^A-Za-z0-9_-]", "_", req.student_id)[:40] or "student"
    filename = f"{safe_id}_{int(time.time() * 1000)}_{uuid.uuid4().hex[:6]}.jpg"
    if not cv2.imwrite(str(FACES_DIR / filename), frames[0]):
        raise HTTPException(status_code=500, detail={"code": "save_failed", "message": "Could not save face image"})

    # new enrollments invalidate the cached gallery immediately
    _GALLERY["loaded"] = False

    return {
        "embedding": embedding.tolist(),
        "templates": template_list,
        "reference_image_url": f"/uploads/faces/{filename}",
        "model": MODEL_NAME,
        "face_count": stats["frames_used"],
        **stats,
        "registered_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=HOST, port=PORT)
