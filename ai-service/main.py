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
POST /face/match    match a webcam frame against every registered student face
POST /face/register compute + store an embedding for one student

Run
---
    python main.py            # or: python -m uvicorn main:app --port 8000
"""

import base64
import binascii
import os
import re
import sys
import time
import uuid
from importlib import metadata as importlib_metadata
from pathlib import Path

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
    image: str = Field(..., description="base64 encoded webcam frame (data URL or raw base64)")
    top_k: int = Field(3, ge=1, le=10, description="How many candidate matches to return")


class RegisterRequest(ImageRequest):
    student_id: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def decode_image(data: str) -> np.ndarray:
    if data.startswith("data:"):
        data = data.split(",", 1)[-1]
    try:
        raw = base64.b64decode(data)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail={"code": "bad_image", "message": "Frame is not valid base64"})
    try:
        frame = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
        if frame is not None and MAX_FRAME_WIDTH and frame.shape[1] > MAX_FRAME_WIDTH:
            # shrink oversized frames: detection stays accurate, CPU cost drops
            scale = MAX_FRAME_WIDTH / float(frame.shape[1])
            frame = cv2.resize(frame, (MAX_FRAME_WIDTH, max(1, int(frame.shape[0] * scale))))
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail={"code": "bad_image", "message": f"Could not decode the image: {exc}"},
        )
    if frame is None:
        raise HTTPException(status_code=400, detail={"code": "bad_image", "message": "Could not decode the image"})
    return frame


def embed(frame: np.ndarray):
    """Return (unit-normalised embedding, face count)."""
    try:
        reps = DeepFace.represent(
            img_path=frame,
            model_name=MODEL_NAME,
            detector_backend=DETECTOR_BACKEND,
            enforce_detection=ENFORCE_DETECTION,
            align=True,
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

    if not reps:
        raise HTTPException(status_code=422, detail={"code": "no_face", "message": "No face detected in the frame"})

    vec = np.asarray(reps[0]["embedding"], dtype=np.float32)
    norm = float(np.linalg.norm(vec))
    if norm == 0:
        raise HTTPException(status_code=500, detail={"code": "inference_error", "message": "Empty embedding"})
    return vec / norm, len(reps)


def _candidate(doc: dict, confidence: float) -> dict:
    return {
        "student_id": str(doc["_id"]),
        "student_code": doc.get("studentId"),
        "name": " ".join(x for x in (doc.get("firstName"), doc.get("lastName")) if x).strip(),
        "payment_status": doc.get("paymentStatus"),
        "confidence": round(confidence, 4),
    }


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
        "mongodb": mongo_ok,
        "deepface": version,
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
    frame = decode_image(req.image)
    query, face_count = embed(frame)

    try:
        docs = [
            d
            for d in students.find(
                {"faceRegistrationStatus": "registered"},
                {
                    "faceData.embeddings": 1,
                    "firstName": 1,
                    "lastName": 1,
                    "studentId": 1,
                    "paymentStatus": 1,
                },
            )
            if (d.get("faceData") or {}).get("embeddings")
        ]
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "db_unavailable",
                "message": f"MongoDB is not reachable from the AI service: {exc}",
            },
        ) from exc

    elapsed = int((time.perf_counter() - started) * 1000)
    base = {
        "model": MODEL_NAME,
        "threshold": MATCH_THRESHOLD,
        "processing_time_ms": elapsed,
        "face_count": face_count,
        "database_size": len(docs),
    }

    vectors, valid = [], []
    for doc in docs:
        try:
            vec = np.asarray(doc["faceData"]["embeddings"], dtype=np.float32)
        except Exception:
            # a corrupted/legacy embedding must never break the whole scan
            logger.warning("skipping bad embedding for student %s", doc.get("studentId"))
            continue
        if vec.ndim != 1 or vec.size != query.size:
            continue
        n = float(np.linalg.norm(vec))
        if n == 0:
            continue
        vectors.append(vec / n)
        valid.append(doc)

    if not valid:
        return {**base, "matched": False, "confidence": 0.0, "best": None, "candidates": [], "reason": "no_faces_registered"}

    sims = np.stack(vectors) @ query
    order = np.argsort(sims)[::-1][: max(req.top_k, 1)]
    candidates = [_candidate(valid[i], float(min(max(sims[i], 0.0), 1.0))) for i in order]

    best_sim = float(sims[order[0]])
    confidence = float(min(max(best_sim, 0.0), 1.0))
    matched = bool(best_sim >= MATCH_THRESHOLD)

    return {
        **base,
        "matched": matched,
        "confidence": round(confidence, 4),
        "best": candidates[0] if candidates else None,
        "candidates": candidates,
        "reason": "matched" if matched else "below_threshold",
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
    frame = decode_image(req.image)
    embedding, face_count = embed(frame)

    FACES_DIR.mkdir(parents=True, exist_ok=True)
    safe_id = re.sub(r"[^A-Za-z0-9_-]", "_", req.student_id)[:40] or "student"
    filename = f"{safe_id}_{int(time.time() * 1000)}_{uuid.uuid4().hex[:6]}.jpg"
    if not cv2.imwrite(str(FACES_DIR / filename), frame):
        raise HTTPException(status_code=500, detail={"code": "save_failed", "message": "Could not save face image"})

    return {
        "embedding": embedding.tolist(),
        "reference_image_url": f"/uploads/faces/{filename}",
        "model": MODEL_NAME,
        "face_count": face_count,
        "registered_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=HOST, port=PORT)
