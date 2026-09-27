# Bus Fee Check System

A full-stack college bus fee verification system: student & bus management, real-time boarding logs,
receipt OCR, unpaid-travel alerts, reporting — plus an **on-device AI face scan** that checks whether
the student who boards the bus has actually paid their fee.

Everything runs on your own laptop: **no cloud AI, no API keys, no subscriptions, no GPU.**

---

## ✨ Highlights

- **Face Scan (AI)** — webcam frame → DeepFace → match against registered students →
  *fee paid* = ignore, *fee unpaid* = travel stored as unpaid + repeat-offender tracking.
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
| Camera | Browser `getUserMedia` (no extra library) |

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
   │  React app  :3000        │  webcam frame (base64 JPEG)
   │  /face-scan page         │
   └────────────┬─────────────┘
                │ HTTPS-less local HTTP + JWT
                ▼
   ┌──────────────────────────┐        ┌────────────────────────────┐
   │  Express API  :5000      │───────▶│  FastAPI face service :8000│
   │  /api/v1/*               │  JSON  │  DeepFace: detect→align→   │
   │  JWT · RBAC · Socket.io  │        │  embed (SFace) + cosine match│
   └────────────┬─────────────┘        └─────────────┬──────────────┘
                │                                    │ pymongo
                │ Mongoose                           ▼
                ▼                         ┌────────────────────────────┐
      ┌──────────────────┐                │  MongoDB  :27017           │
      │  uploads/        │◀── face photos─│  bus-fee-system            │
      └──────────────────┘                └────────────────────────────┘
```

### Face scan decision rules

| Result | What gets stored | User sees |
|---|---|---|
| Matched, `paymentStatus = paid` | `FaceRecognitionLog` only (audit) | green *“Fee Paid — Boarding Allowed”* |
| Matched, `paymentStatus = unpaid` / `pending` | log + `TravelRecord (isUnpaid)` + `UnpaidTravel` (repeat count) + Socket.io `new-travel` | red *“Unpaid Travel Recorded”* |
| No match / below threshold | `FaceRecognitionLog` as `unidentified` or `low_confidence` | orange *“Unknown face”* |

Registration stores a **128-d embedding** + reference photo on `Student.faceData`, and sets
`faceRegistrationStatus = registered`.

---

## 📁 Project Structure

```text
├── ai-service/                 # Local DeepFace microservice (Python)
│   ├── main.py                 #   GET /health · POST /face/match · POST /face/register
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
│   ├── uploads/                # receipts + captured face photos (git-ignored)
│   ├── eng.traineddata         # tesseract OCR data (local, free)
│   ├── seed-fresh.js           # creates the admin user
│   ├── .env.example            # copy to .env
│   └── server.js
├── frontend/
│   └── src/
│       ├── api/client.js       # axios + JWT refresh interceptor
│       ├── components/         # AppLayout, Sidebar, ProtectedRoute
│       ├── hooks/              # useAuth, useWebSocket
│       ├── pages/              # Login, Dashboard, Students, Buses, FaceScan,
│       │                       # TravelRecords, UnpaidTravels, Reports
│       ├── stores/             # authStore, travelStore (zustand)
│       └── App.jsx             # routes
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

Open **Face Scan** in the sidebar → allow the camera → pick a bus → **Scan Face**.

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

### `ai-service/.env` (optional — see `.env.example`)
| Key | Purpose | Default |
|---|---|---|
| `FACE_MODEL` | DeepFace embedding model | `SFace` |
| `FACE_DETECTOR` | face detector | `yunet` |
| `FACE_MATCH_THRESHOLD` | minimum cosine similarity (0–1) | DeepFace's tuned value → `0.407` |
| `FACE_ENFORCE_DETECTION` | reject frames with no detectable face | `true` |
| `FACE_MAX_FRAME_WIDTH` | downscale frames to cut CPU cost | `960` |
| `AI_SERVICE_HOST` / `AI_SERVICE_PORT` | bind address | `127.0.0.1` / `8000` |
| `MONGODB_URI` | falls back to `backend/.env` | same as backend |

---

## 📖 Features & Modules

| Module | Details |
|---|---|
| **Dashboard** | live totals, today's travels, unpaid stats via `/analytics/dashboard` |
| **Students** | CRUD, photo upload (base64), bus assignment, payment status, face status, bulk receipt upload |
| **Buses** | CRUD, routes, driver info, assigned student counts |
| **Face Scan** | webcam boarding check + face registration (see above) |
| **Travel Records** | paginated boarding/alighting logs, filters by student/bus/date |
| **Unpaid Travels** | list, resolve, repeat offenders (≥3 unresolved) |
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
| **Face** | `POST /face/scan` | body `{ image, busId, location? }` → decision object |
| | `POST /face/register/:studentId` | body `{ image }` → stores embedding + photo |
| | `GET /face/health` | local AI service status (public) |
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
  "status": "unpaid_recorded",     // paid_ignored | unpaid_recorded | unidentified | low_confidence
  "action": "record_unpaid_travel",// ignore (when the fee is paid)
  "feeStatus": "unpaid",
  "student": { "studentId": "STU101", "firstName": "...", "paymentStatus": "unpaid" },
  "confidence": 0.63,
  "threshold": 0.407,
  "repeatCount": 2,
  "message": "Fee not paid - travel stored as unpaid"
}
```

### MongoDB collections
`admins`, `students`, `buses`, `travelrecords`, `unpaidtravels`,
`facerecognitionlogs`, `feereceipts`, `feepayments`

Key fields: `Student.paymentStatus` (`paid|unpaid|pending`), `Student.faceRegistrationStatus`
(`not_registered|pending|registered|failed`), `Student.faceData.embeddings` (128 floats),
`UnpaidTravel.isRepeatOffense` / `repeatCount`.

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

1. The browser grabs a video frame and sends it as base64 to `POST /api/v1/face/scan`.
2. Node forwards it to the local FastAPI service, which runs **DeepFace**:
   `YuNet` detects the face → aligned crop → `SFace` produces a **128-d embedding** (L2-normalised).
3. The embedding is compared with every registered student using **cosine similarity**;
   the best score must be ≥ `FACE_MATCH_THRESHOLD` (default `0.407` — DeepFace's own tuned value for SFace).
4. Node applies the business rules in the table above and returns + broadcasts the result.

**Cost:** zero. No hosted API, no key, no usage billing — DeepFace, OpenCV, SFace and YuNet are
open source and run on your machine. **CPU only:** frames are capped at 960 px, the model is loaded
once and reused, and typical scans take well under a second after the first warm-up.

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

---

## 🧰 Troubleshooting

| Symptom | Fix |
|---|---|
| `Face AI service is unreachable` (503) | start it: `cd ai-service && python main.py` |
| `Face could not be detected` (422) | look straight at the camera, improve lighting, or set `FACE_ENFORCE_DETECTION=false` for tests |
| Known face not matching | lower `FACE_MATCH_THRESHOLD`, re-register the face in good light |
| Camera not starting | serve over `localhost`/`https`, and allow camera permission in the browser |
| `MongoDB is not reachable` (503) | start `mongod`, check `MONGODB_URI` in `backend/.env` |
| Admin login fails | re-run `node seed-fresh.js` in `backend/` |
| Heavy CPU | lower `FACE_MAX_FRAME_WIDTH` (e.g. `640`) |

---

## 📝 Notes

- `frontend/src/pages/Payments.jsx` is legacy — the payment routes were removed
  (`backend/controllers/payment.controller.js` is a stub); fee status is edited on the student form.
- `POST /webhook/recognition` is the legacy integration path for external recognition devices and is
  kept for compatibility alongside `/face/scan`.
- Repo hygiene: real `.env` files are untracked; if an old commit contained secrets, rotate them
  (and consider rewriting history before publishing).
