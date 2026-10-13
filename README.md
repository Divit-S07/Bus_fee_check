# Bus Fee Check System

A full-stack college bus fee verification system: student & bus management, real-time boarding logs,
receipt OCR, unpaid-travel alerts, reporting — plus an **on-device AI face scan** that checks whether
the student who boards the bus has actually paid their fee.

Everything runs on your own laptop: **no cloud AI, no API keys, no subscriptions, no GPU.**

---

## ✨ Highlights

- **ESP32-CAM boarding scanner** — the Face Scan page shows a live MJPEG stream from an
  **ESP32-CAM** on your Wi-Fi network; stills are pulled from the camera's `/capture` endpoint.
- **Face Scan (AI)** — *fully automatic*: a 1-second presence poll runs while the page is open;
  the moment someone appears it captures 3 frames and matches them → *every* matched boarding is
  stored in **Travel Records**; unpaid ones are additionally tracked as repeat offences.
- **Unknown Faces** — every unrecognised scan keeps its captured photo (in MongoDB) so an admin can
  review who showed up but was never identified.
- **100% free & local** — DeepFace + OpenCV `SFace`/`YuNet` models on the CPU.
  One-time ~37 MB model cache, then fully offline.
- **Real-time** — Socket.io pushes new travels, unpaid alerts and scan results to the dashboard.
- **Receipt OCR** — upload images / PDF / DOCX receipts, text is extracted locally with tesseract.js.
- **Reporting** — daily / weekly / monthly summaries and analytics.

---

## 🚀 Tech Stack

### Frontend (`frontend/`)
| Concern | Choice |
|---|---|
| Framework | React 18 + Vite 4 (dev server on **port 3000**) |
| UI | Ant Design 5 |
| State | Zustand (`authStore`, `travelStore`) |
| Routing | React Router v6 |
| Charts | Recharts |
| Realtime | socket.io-client |
| Camera | **ESP32-CAM** — MJPEG `<img>` stream + JPEG stills from `/capture`, read straight from the browser |

### Backend (`backend/`)
| Concern | Choice |
|---|---|
| Runtime | Node.js + Express 4 |
| Database | MongoDB via Mongoose 7 |
| Realtime | Socket.io 4 |
| Auth | JWT access + refresh tokens, bcrypt, RBAC (`super_admin` / `admin`) |
| Hardening | Helmet, CORS, express-rate-limit |
| Uploads | Multer (receipts) + Sharp |
| OCR / docs | tesseract.js (+ bundled `eng.traineddata`), pdf-parse, mammoth (docx) |

### Face recognition (`ai-service/`)
| Concern | Choice |
|---|---|
| Framework | **DeepFace** 0.0.101 (Python) |
| Service | FastAPI + Uvicorn on **port 8000** |
| Embedding model | **SFace** — OpenCV ONNX, 128-d, CPU only |
| Face detector | **YuNet** — OpenCV DNN (~230 KB) |
| Explicitly **not** used | TensorFlow, PyTorch, GPU, cloud APIs (saves a ~384 MB install) |
| DB access | pymongo (reads `students` collection) |

---

## 🏗️ Architecture

```
   ┌──────────────────────────┐
   │  ESP32-CAM :81           │  MJPEG stream → <img>
   │  /stream · /capture      │  stills → AI frames
   └────────────┬─────────────┘
                │ same Wi-Fi (LAN)
                ▼
   ┌──────────────────────────┐
   │  React app  :3000        │  /face-scan: detect poll (1 s) → 3 JPEG frames
   │  auto-scan, no button    │  (base64)  OR  registration frames
   └────────────┬─────────────┘
                │ HTTPS-less local HTTP + JWT
                ▼
   ┌──────────────────────────┐        ┌────────────────────────────┐
   │  Express API  :5000      │───────▶│  FastAPI face service :8000│
   │  /api/v1/*               │  JSON  │  /face/detect → YuNet only │
   │  JWT · RBAC · Socket.io  │        │  /face/match  → batched    │
   └────────────┬─────────────┘        │  SFace embed + cosine match│
                │                      └─────────────┬──────────────┘
                │ Mongoose                           │ pymongo (gallery)
                ▼                                    ▼
      ┌──────────────────────────────────────────────────────┐
      │  MongoDB  :27017  bus-fee-system                     │
      │  travelrecords · unpaidtravels · facerecognitionlogs │
      │  (incl. capturedImage) · students (faceData)         │
      └──────────────────────────────────────────────────────┘
                ▲
                │ receipts only
      ┌──────────────────┐
      │  uploads/        │  face photos are stored in the DB, not on disk
      └──────────────────┘
```

> **ESP32 note:** the browser talks to the camera directly (`VITE_ESP32_CAM_URL` /
> `VITE_ESP32_CAM_STREAM_URL`), so the camera must be reachable from your machine and CORS on the
> firmware is a known limitation — see [Known Issues](#known-issues--limitations).

### Face scan decision rules

| Result | What gets stored | User sees |
|---|---|---|
| Matched, `paymentStatus = paid` | `FaceRecognitionLog` + `TravelRecord (isUnpaid = false)` → shows in Travel Records | green *“Fee Paid — Boarding Allowed”* |
| Matched, `paymentStatus = unpaid` / `pending` | log + `TravelRecord (isUnpaid)` + `UnpaidTravel` (repeat count) + Socket.io `new-travel` | red *“Unpaid Travel Recorded”* |
| No match / below threshold | `FaceRecognitionLog` with the **captured photo** (`isUnknown`) → appears on the **Unknown Faces** page | orange *“Unknown face”* |

Registration stores up to `FACE_MAX_TEMPLATES` distinct **128-d embeddings** + a reference photo on
`Student.faceData`, and sets `faceRegistrationStatus = registered`.

---

## 📁 Project Structure

```text
├── ai-service/                 # Local DeepFace microservice (Python)
│   ├── main.py                 #   GET /health · POST /face/detect · /face/match · /face/register
│   ├── requirements.txt        #   light CPU-only deps (installed with --no-deps deepface)
│   ├── setup.bat               #   one-time Windows install
│   ├── start.bat               #   Windows start
│   └── .env.example            #   model / detector / threshold settings
├── backend/
│   ├── config/database.js
│   ├── controllers/            # auth, students, buses, travel, unpaid, reports,
│   │                           # analytics, receipts, webhook, face
│   ├── middleware/             # JWT auth, RBAC, webhook signature
│   ├── models/                 # Admin, Bus, Student, TravelRecord, UnpaidTravel,
│   │                           # FaceRecognitionLog, FeeReceipt, FeePayment
│   ├── routes/                 # /auth /students /buses /travel /unpaid /reports
│   │                           # /analytics /receipts /webhook /face
│   ├── services/               # receipt OCR, travel, fee, faceAI (HTTP client)
│   ├── sockets/                # Socket.io init
│   ├── uploads/                # receipts only, git-ignored (face photos live in MongoDB)
│   ├── eng.traineddata         # tesseract OCR data (local, free)
│   ├── seed-fresh.js           # creates the admin user
│   ├── .env.example            # copy to .env
│   └── server.js
├── frontend/
│   ├── index.html              # Vite entry (root) — public/index.html is a CRA leftover
│   ├── vite.config.js          # dev server on port 3000
│   └── src/
│       ├── api/client.js       # axios + JWT refresh interceptor
│       ├── components/         # AppLayout, Sidebar, ProtectedRoute
│       ├── hooks/              # useAuth, useWebSocket
│       ├── pages/              # Login, Dashboard, Students, Buses, FaceScan,
│       │                       # TravelRecords, UnpaidTravels, UnknownFaces, Reports
│       ├── stores/             # authStore, travelStore (zustand)
│       └── App.jsx             # routes
├── .vscode/settings.json       # shared editor settings
├── bus_logo.jpg                # logo source (also frontend/src/assets/bus-logo.jpg)
├── .gitignore
└── README.md
```

---

## 🛠️ Getting Started

### Prerequisites
- **Node.js** 16+ (`node -v`)
- **Python** 3.10+ (`python -v`) for the AI service
- **MongoDB** running locally (or a connection URI)

### 1) MongoDB
```bash
mongod                     # default: mongodb://localhost:27017
```

### 2) Backend
```bash
cd backend
npm install
cp .env.example .env       # Windows: copy .env.example .env
node seed-fresh.js          # creates the admin account
npm run dev                 # http://localhost:5000
```

Default admin: **admin@college.edu / admin123** — change it after first login.

### 3) Frontend
```bash
cd frontend
npm install
cp .env.example .env
npm run dev                 # http://localhost:3000
```
Set `VITE_ESP32_CAM_URL` / `VITE_ESP32_CAM_STREAM_URL` in `frontend/.env` to your camera's IP if
you use the Face Scan page (the camera must be on the same network as your machine).

### 4) Face AI service (local, free)
```bash
cd ai-service
python -m pip install -r requirements.txt
python -m pip install --no-deps deepface    # --no-deps keeps TensorFlow out
python main.py                              # http://127.0.0.1:8000
```
On Windows you can just run `setup.bat` once and `start.bat` afterwards.

> **First start only:** DeepFace caches two model files in `~/.deepface/weights`
> (`face_recognition_sface_2021dec.onnx` ≈ 37 MB, `face_detection_yunet_2023mar.onnx` ≈ 230 KB).
> After that the service runs **completely offline**, CPU only.

Open **Face Scan** in the sidebar → click **Start Camera** (loads the ESP32-CAM live stream) → pick
a bus. That is all: the page polls for a face once a second and scans **automatically** the moment
somebody appears (there is no Scan button). The scan disarms afterwards and re-arms only once the
face has left the frame.

---

## ⚙️ Configuration

### `backend/.env`
| Key | Purpose | Default |
|---|---|---|
| `PORT` | API port | `5000` |
| `MONGODB_URI` | database | `mongodb://localhost:27017/bus-fee-system` |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | token signing | *(change these)* |
| `JWT_EXPIRY` / `JWT_REFRESH_EXPIRY` | token lifetime | `15m` / `7d` |
| `CORS_ORIGIN` | allowed origins | `http://localhost:3000,http://localhost:5173` |
| `RATE_LIMIT_WINDOW` / `RATE_LIMIT_MAX` | throttling | `60000` / `100` |
| `AI_SERVICE_URL` | DeepFace service | `http://127.0.0.1:8000` |
| `AI_SERVICE_TIMEOUT_MS` | scan timeout | `120000` |
| `DEFAULT_LOCATION_LONGITUDE/LATITUDE` | fallback GPS for travel records | `77.5946` / `12.9716` |

### `frontend/.env`
| Key | Purpose |
|---|---|
| `VITE_API_URL` | `http://localhost:5000/api/v1` |
| `VITE_WS_URL` | `ws://localhost:5000` |
| `VITE_ESP32_CAM_URL` | base URL of the ESP32-CAM still endpoint (e.g. `http://192.168.1.42/` → `/capture`) |
| `VITE_ESP32_CAM_STREAM_URL` | MJPEG stream URL for the live `<img>` (e.g. `http://192.168.1.42:81/stream`) |

### `ai-service/.env` (optional — see `.env.example`)
| Key | Purpose | Default |
|---|---|---|
| `FACE_MODEL` | DeepFace embedding model | `SFace` |
| `FACE_DETECTOR` | face detector | `yunet` |
| `FACE_MATCH_THRESHOLD` | minimum cosine similarity (0–1) | DeepFace's tuned value → `0.407` |
| `FACE_ENFORCE_DETECTION` | reject frames with no detectable face | `true` |
| `FACE_MAX_FRAME_WIDTH` | downscale frames to cut CPU cost | `960` |
| `YUNET_SCORE_THRESHOLD` | minimum YuNet detection score (0.9 was too strict for webcams) | `0.6` |
| `FACE_EXPAND_PERCENTAGE` | pad the detected box before embedding | `15` |
| `FACE_MIN_MARGIN` | best-vs-runner-up cosine gap required to accept | `0.04` |
| `FACE_MAX_FRAMES` / `FACE_MAX_TEMPLATES` | frames per scan / templates stored per student | `5` / `4` |
| `FACE_GALLERY_TTL_MS` | how long the normalised gallery is cached | `3000` |
| `AI_SERVICE_HOST` / `AI_SERVICE_PORT` | bind address | `127.0.0.1` / `8000` |
| `MONGODB_URI` | falls back to `backend/.env` | same as backend |

---

## 📖 Features & Modules

| Module | Details |
|---|---|
| **Dashboard** | live totals, today's travels, unpaid stats via `/analytics/dashboard` |
| **Students** | CRUD, photo upload (base64), bus assignment, payment status, face status, bulk receipt upload |
| **Buses** | CRUD, routes, driver info, assigned student counts |
| **Face Scan** | ESP32-CAM live stream + auto boarding check and face registration (see above) |
| **Travel Records** | paginated boarding/alighting logs, filters by student/bus/date |
| **Unpaid Travels** | list, resolve, repeat offenders (≥3 unresolved) |
| **Unknown Faces** | every unrecognised scan with its captured photo, today/total counts |
| **Reports** | `/reports/daily`, `/reports/weekly`, `/reports/monthly` |
| **Receipts** | upload up to 10 images/PDF/DOCX → OCR (tesseract.js, `pdf-parse`, `mammoth`) → matched to students |
| **Auth** | login, refresh, `GET /auth/me`, JWT + RBAC |

---

## 🔌 API Reference (`/api/v1`)

| Group | Endpoint | Notes |
|---|---|---|
| Auth | `POST /auth/login` · `POST /auth/refresh` · `GET /auth/me` | public / public / auth |
| Students | `GET /students` · `GET/PUT/DELETE /students/:id` · `POST /students` | write = admin |
| | `POST /students/:id/face-register` | legacy embedding endpoint |
| Buses | `GET /buses` · `GET/PUT/DELETE /buses/:id` · `POST /buses` | write = admin |
| **Face** | `POST /face/detect` | body `{ image }` → `{ face_count }` presence check (rate-limit exempt) |
| | `POST /face/scan` | body `{ image | images[3], busId, location? }` → decision object |
| | `POST /face/register/:studentId` | body `{ image | images[3] }` → stores templates + photo |
| | `GET /face/health` | local AI service status (public) |
| | `GET /face/unknown` · `GET /face/unknown/:logId/image` | unknown-face gallery + its stored photo |
| Travel | `GET /travel?page&limit&studentId&busId&startDate&endDate` | |
| Unpaid | `GET /unpaid?resolved=` · `PUT /unpaid/:id/resolve` · `GET /unpaid/repeat-offenders` | |
| Reports | `GET /reports/daily` · `/weekly` · `/monthly` | |
| Analytics | `GET /analytics/dashboard` | |
| Receipts | `POST /receipts/upload` (multipart `receipts[]`) · `GET /receipts` · `/receipts/student/:id` · `/:id/image` · `/:id/photo` | |
| Webhook | `POST /webhook/recognition` | signature-verified external recognition source |

### `POST /face/scan` response shape
```jsonc
{
  "matched": true,
  "status": "paid_ignored",         // paid_ignored | unpaid_recorded | unidentified | low_confidence
  "action": "record_boarding",      // record_unpaid_travel when the fee is unpaid
  "feeStatus": "paid",              // paid | unpaid | pending
  "student": { "studentId": "STU101", "firstName": "...", "paymentStatus": "paid" },
  "confidence": 0.63,
  "threshold": 0.407,
  "model": "SFace",
  "frames": 3,                      // usable frames out of
  "framesTotal": 3,                 // how many were sent
  "logId": "665f...",               // FaceRecognitionLog id
  "travelId": "665f...",            // TravelRecord id (every match creates one)
  "repeatCount": 2,                 // unpaid only
  "message": "Fee already paid - boarding allowed and recorded for today"
}
```
Unknown faces answer with `"matched": false`, `isUnknown: true`, a `capturedImage` data URL and a
`logId` that points at the row shown on the **Unknown Faces** page.

### MongoDB collections
`admins`, `students`, `buses`, `travelrecords`, `unpaidtravels`,
`facerecognitionlogs`, `feereceipts`, `feepayments`

Key fields: `Student.paymentStatus` (`paid|unpaid|pending`), `Student.faceRegistrationStatus`
(`not_registered|pending|registered|failed`), `Student.faceData.embeddings` (128 floats) and
`Student.faceData.templates` (up to 4 vectors), `UnpaidTravel.isRepeatOffense` / `repeatCount`,
`FaceRecognitionLog.capturedImage` (binary, excluded from queries by default — select it explicitly
to render the Unknown Faces photo).

---

## 🔴 Real-time events (Socket.io)

| Event | Direction | Payload |
|---|---|---|
| `join-dashboard` | client → server | – |
| `new-travel` | server → clients | `{ travel, unpaid, feeStatus }` |
| `face-scan` | server → clients | full scan result (paid/unpaid/unknown) |
| `face-registered` | server → clients | `{ studentId, model }` |

---

## 🤖 Face Recognition — how it works & why it's free

1. The Face Scan page polls `POST /api/v1/face/detect` about once a second. It is a **YuNet-only
   presence check** (no embedding, no MongoDB, no log) - nothing happens while the seat is empty.
2. The moment a person appears it grabs **3 quick frames** (downscaled to 960 px) and posts them to
   `POST /api/v1/face/scan`. There is **no scan button**; the scan disarms afterwards and only
   re-arms once the face leaves, so one person can never produce two travel records.
3. Node forwards them to the local FastAPI service, which runs **DeepFace** in a **single batched pass**:
   `YuNet` detects each face → aligned padded crop → `SFace` produces a **128-d embedding** per frame.
   Blurry/undetected frames are dropped, the rest are averaged into one steady query vector.
4. The query is compared with every stored template using **cosine similarity**, max-pooled per student;
   the best score must be ≥ `FACE_MATCH_THRESHOLD` (default `0.407` — DeepFace's own tuned value for SFace)
   **and** clear the runner-up by ≥ `FACE_MIN_MARGIN`, otherwise the scan is reported as ambiguous.
5. Node applies the business rules in the table above and returns + broadcasts the result.

Registration stores up to `FACE_MAX_TEMPLATES` distinct templates per student (not just one photo),
so matching takes the best hit across them. Nothing about the models changed: still **SFace** (37 MB)
and **YuNet** (230 KB), both cached once and reused.

**Cost:** zero. No hosted API, no key, no usage billing — DeepFace, OpenCV, SFace and YuNet are
open source and run on your machine. **CPU only:** frames are capped at 960 px, the model is loaded
once and reused, the gallery is cached for `FACE_GALLERY_TTL_MS`, and typical scans take well under
a second after the first warm-up.

**Tuning:** raise `FACE_MATCH_THRESHOLD` (e.g. `0.5`) for fewer false positives at the cost of more
“unknown face” results; lower it if legitimate riders are rejected. Use `FACE_MODEL=ArcFace` only if
you are willing to install TensorFlow — the default `SFace` deliberately avoids it.

---

## 🔒 Security

- JWT access/refresh tokens with an automatic refresh interceptor on the frontend
- RBAC: `super_admin` / `admin` required for writes, deletes, face registration, receipt upload
- Helmet, CORS allow-list, rate limiting (`100 req / 60 s` on `/api`)
- Signed webhooks (`AI_SYSTEM_WEBHOOK_SECRET`)
- `.env` files are **git-ignored** — only `.env.example` templates are committed
- Faces are matched locally; no video or photo ever leaves the laptop
- Captured face photos live in MongoDB (`FaceRecognitionLog.capturedImage`), never on disk;
  `backend/uploads/` is git-ignored and holds receipts only
- Model weights are downloaded once to `~/.deepface/weights`, outside the repository —
  `.gitignore` blocks `*.onnx`/`*.h5`/… so no 37 MB binary can ever be committed

---

## 🧰 Troubleshooting

| Symptom | Fix |
|---|---|
| `Face AI service is unreachable` (503) | start it: `cd ai-service && python main.py` |
| `Face could not be detected` (422) | look straight at the camera, improve lighting, or set `FACE_ENFORCE_DETECTION=false` for tests |
| Known face not matching | lower `FACE_MATCH_THRESHOLD`, re-register the face in good light |
| ESP32 stream won't load ("Cannot connect to ESP32-CAM stream") | camera powered on & same Wi-Fi; open `VITE_ESP32_CAM_URL` in a browser; try `:81/stream` vs `/` — firmware-dependent |
| Frames always fail / `ESP32 capture error` | ESP32 firmware sends no CORS headers, so a cross-origin `fetch('/capture')` is blocked — see [Known Issues](#known-issues--limitations) |
| Wrong/blank camera feed | fix `VITE_ESP32_CAM_URL` (no trailing slash) and `VITE_ESP32_CAM_STREAM_URL` in `frontend/.env`, then restart `npm run dev` |
| `MongoDB is not reachable` (503) | start `mongod`, check `MONGODB_URI` in `backend/.env` |
| Admin login fails | re-run `node seed-fresh.js` in `backend/` |
| Heavy CPU | lower `FACE_MAX_FRAME_WIDTH` (e.g. `640`) |
| Unknown Faces page is empty | nothing to fix — every recent scan matched a student; check the `face-scan` strip on `/face-scan` |
| Unknown face photo missing | the row predates photo storage, or `GET /face/unknown/:id/image` returned 401 → log in again |
| Same person recorded twice | they must leave the frame first; auto-scan re-arms only after the face is gone (`SCAN_COOLDOWN_MS` = 5 s) |
| Too many “unknown face” rows | lower `FACE_MATCH_THRESHOLD` / `FACE_MIN_MARGIN`, or re-register the students in better light |

---

## Known Issues & Limitations

- **ESP32-CAM capture can be blocked by CORS** — the browser fetches `/capture` from the camera
  directly and the firmware sends no `Access-Control-Allow-Origin` header, so `capture()` may
  return `null` when the page origin (localhost:3000) differs from the camera's. Workarounds: run
  the camera firmware with CORS enabled, or serve the frontend from the same origin. A proper fix
  (proxying `/capture` and `/stream` through the Node backend) is specced in
  `.opencode/plans/esp32-camera-proxy.md` and not yet implemented.
- **Reports chart uses placeholder data** — the Recharts area graph on `/reports` is hardcoded;
  only the KPI numbers come from `/reports/daily`.
- **No 404 route** — unmatched URLs render a blank page (no catch-all route in `App.jsx`).
- **Webhook path is broken** — `POST /webhook/recognition` writes `feeStatusAtTime: 'active'`,
  which is not one of `TravelRecord`'s allowed values (`paid|unpaid|expired`), so the event fails
  validation. `/face/scan` (the primary path) is unaffected.
- **`/uploads` is served unauthenticated** — receipt images (student PII) are reachable by anyone
  who can hit the API port and guess a filename.
- **Placeholder UI** — notification bell (always 0), Profile/Settings menu items, CSV export
  button, and `Payments.jsx` are non-functional stubs.
- **Default seed credentials are public** — `node seed-fresh.js` creates
  `admin@college.edu` / `admin123`; change the password before any shared deployment.
- **No tests, linter or CI** — scripts are `dev`/`build`/`preview` (frontend) and
  `start`/`dev` (backend) only; verification is manual.

---

## 📝 Notes

- `frontend/src/pages/Payments.jsx` is legacy — the payment routes were removed
  (`backend/controllers/payment.controller.js` is a stub); fee status is edited on the student form.
- `POST /webhook/recognition` is the legacy integration path for external recognition devices and is
  kept for compatibility alongside `/face/scan`.
- Repo hygiene: real `.env` files are untracked; if an old commit contained secrets, rotate them
  (and consider rewriting history before publishing).
