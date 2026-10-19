# Bus Fee Check System 🚌💳

A modern, full-stack college bus fee verification system featuring real-time boarding verification, automated student & bus management, fee receipt OCR, **top-right student photo extraction**, **bus-wise unpaid student tracking**, and **on-device AI face recognition** powered by an **ESP32-CAM live video stream**.

Everything runs locally: **no cloud AI, no subscription costs, no API keys, and no GPU required.**

---

## ✨ Key Highlights

- **ESP32-CAM Live Video Stream**:
  - Piped through a high-performance backend proxy (`/api/v1/esp32/stream`), eliminating browser CORS restrictions and mixed-content issues.
  - **Single-connection upstream architecture**: The Node backend maintains one persistent connection to the ESP32-CAM, fanning out frames to browser clients and AI face capture without choking the camera.
  - **Auto-reconnection & URL Caching**: Remembers the active working candidate endpoint and reconnects in under 100ms.
  - **LAN Camera Discovery**: Scans local subnets for the ESP32-CAM directly from the UI.

- **Real-Time Automated Face Detection & Boarding Check**:
  - Live video guide oval with dynamic status indicator (looking, verifying, fee paid, unpaid, unknown).
  - Automatically captures and evaluates frames when a passenger appears in front of the camera.
  - Compares against enrolled student face templates in MongoDB using **DeepFace SFace** (128-d embeddings) + **YuNet** detection.
  - **Anti-False-Positive Tuning (`threshold = 0.65`)**: Rigorously calibrated so different individuals are not falsely matched to enrolled students.

- **Automated Top-Right Student Photo Extraction from Receipts**:
  - Automatically extracts the student's passport photograph from the **top-right corner** of uploaded bus fee receipts or transport applications.
  - **Multi-Stage Computer Vision Pipeline**:
    1. **Top-Right Bordered Rectangle Detection**: Scans the top-right ROI for passport photo frame boundaries.
    2. **Top-Right Neural Face Detection**: Uses TinyFaceDetector to locate the student's face within the ROI and crop with standard passport margins.
    3. **Full-Page Fallback**: Handles non-standard receipt layouts.
  - **Universal Format Support**: Works across PDF documents (`pdf-parse`), raster images (JPG, PNG, WEBP, BMP), and Word documents (`mammoth`/`jszip`).
  - **Full-Site Display**: Extracted photo is stored in MongoDB (`Student.photoUrl` and `FeeReceipt.studentPhoto`) and displayed across all views (Students, Travel Records, Unpaid Travels, Bus Unpaid Tracking, Dashboard, Face Scan).

- **Bus-Wise Unpaid Student Tracking**:
  - Dedicated aggregation dashboard grouping unpaid student records by college bus number and route.
  - **Automatic Live Updates**: Face recognition boarding automatically creates or increments the student's unpaid trip count for that specific bus.
  - **Repeat Offender Alerts**: Flags students with $\ge 3$ unpaid trips on a bus or across buses.
  - **Interactive Dual Views**: Switch between *Grouped Bus Cards* and a *Detailed Flat Table*.
  - **Student Boarding History Modal**: Complete timeline of every boarding logged by face recognition with timestamps, match confidence, and reasons.
  - **Resolution Workflow**: Allows administrators to record payment verification notes and resolve unpaid records.
  - **Real-Time Sync & CSV Export**: Instant WebSocket updates via Socket.io, historical data backfill utility, and one-click CSV export.

- **Fee Status Enforcement**:
  - **Paid Students**: Instant green *“Fee Paid — Boarding Allowed”* confirmation and logged in Travel Records.
  - **Unpaid / Pending Students**: Red *“Unpaid Travel Recorded”* alert, logged in Unpaid Travels and Bus Unpaid Tracking.

- **Unknown Faces Review**:
  - Any unmatched person's face photo is stored directly as binary in MongoDB (no disk files needed) and surfaced in the admin **Unknown Faces** gallery.

- **Reporting & Analytics**:
  - Daily, weekly, and monthly travel summaries and charts.

---

## 🏗️ Architecture

```
               ┌───────────────────────────┐
               │   ESP32-CAM (Wi-Fi LAN)   │
               │   http://10.67.1.56       │
               └─────────────┬─────────────┘
                             │ MJPEG Upstream (Port 80/81)
                             ▼
               ┌───────────────────────────┐
               │    Express API  :5000     │◀──────────────────────┐
               │    /api/v1/esp32/* proxy  │                       │
               │    JWT · RBAC · Socket.io │                       │
               │    Receipt CV Extractor   │                       │
               └──────┬─────────────────┬──┘                       │
                      │                 │                          │
      Piped Stream &  │                 │ REST JSON                │
      Single Capture  │                 │                          │
                      ▼                 ▼                          │
        ┌───────────────────┐    ┌──────────────────────────┐      │
        │ React App  :3000  │    │ FastAPI AI Service :8000 │      │
        │ Live Stream <img> │    │ DeepFace SFace + YuNet   │      │
        │ Real-time UI      │    └────────────┬─────────────┘      │
        └───────────────────┘                 │                    │
                                              │ pymongo            │ Mongoose
                                              ▼                    ▼
                                ┌───────────────────────────────────────┐
                                │          MongoDB  :27017              │
                                │          bus-fee-system               │
                                │ students · travelrecords · logs       │
                                │ busunpaidtrackings · feereceipts      │
                                └───────────────────────────────────────┘
```

---

## 🚀 Tech Stack

### Frontend (`frontend/`)
- **React 18** + **Vite 4** (running on port `3000` / `5173`)
- **Ant Design 5** UI component library
- **Zustand** (`authStore`, `travelStore`) for client state management
- **React Router v6**
- **Socket.io-client** for real-time WebSocket events
- **Axios** with proactive JWT token refresh interceptors

### Backend (`backend/`)
- **Node.js** + **Express 4** (running on port `5000`)
- **Mongoose 7** + **MongoDB**
- **Socket.io 4** for real-time broadcasting
- **Helmet**, **CORS**, and **express-rate-limit**
- **Sharp**, **@vladmandic/face-api**, **tesseract.js**, **pdf-parse**, and **mammoth** for OCR and computer vision photo extraction
- **Custom ESP32-CAM Proxy Service**: single-connection multiplexer, MJPEG frame splitter, and network scanner

### AI Service (`ai-service/`)
- **Python 3.10+** + **FastAPI** + **Uvicorn** (running on port `8000`)
- **DeepFace 0.0.101** with backend-agnostic configuration (CPU only, TensorFlow/PyTorch not required)
- **SFace**: 128-dimensional ONNX face recognition model (~37 MB one-time cache)
- **YuNet**: OpenCV DNN face detector (~230 KB one-time cache)
- **Gallery Caching**: In-memory normalized embedding matrix with TTL

---

## 📁 Directory Structure

```text
Bus_fee_check/
├── ai-service/                 # Local Python face recognition microservice
│   ├── main.py                 #   FastAPI app (/health, /face/detect, /face/match, /face/register)
│   ├── requirements.txt        #   CPU-only lightweight dependencies
│   ├── setup.bat               #   One-click Windows setup script
│   ├── start.bat               #   One-click Windows start script
│   └── .env.example            #   AI service environment template
├── backend/                    # Express.js REST API & WebSocket server
│   ├── config/database.js      #   MongoDB connection
│   ├── controllers/            #   Endpoint logic:
│   │   ├── busUnpaid.controller.js   # Bus-wise unpaid student tracking
│   │   ├── face.controller.js        # Face scan & verification
│   │   ├── receipt.controller.js     # Receipt OCR & photo extraction
│   │   ├── student.controller.js     # Student management
│   │   ├── travel.controller.js      # Travel history
│   │   └── unpaid.controller.js      # Unpaid travel logs
│   ├── middleware/             #   JWT auth, RBAC, rate-limiting
│   ├── models/                 #   Mongoose schemas:
│   │   ├── BusUnpaidTracking.js      # Bus-wise unpaid student tracking model
│   │   ├── FeeReceipt.js             # Receipt OCR and extracted student photo
│   │   ├── Student.js                # Student records with photoUrl & faceData
│   │   ├── TravelRecord.js           # Individual trip logs
│   │   ├── UnpaidTravel.js           # Unpaid trip logs
│   │   └── FaceRecognitionLog.js     # Scanned face logs
│   ├── routes/                 #   Express route definitions (/esp32, /face, /bus-unpaid, etc.)
│   ├── services/               #   Services:
│   │   ├── busUnpaidTracking.service.js # Auto-upsert & socket events for unpaid tracking
│   │   ├── receipt.service.js           # Top-right student photo extraction & OCR
│   │   ├── esp32.service.js             # ESP32-CAM stream proxy & scanner
│   │   └── faceAI.service.js            # Node client for FastAPI AI service
│   ├── sockets/                #   Socket.io real-time server
│   ├── seed-fresh.js           #   Admin initialization script
│   ├── .env.example            #   Backend environment template
│   └── server.js               #   Application entry point
├── frontend/                   # React 18 + Vite SPA
│   ├── src/
│   │   ├── api/client.js       #   Axios client with auto-refresh
│   │   ├── components/         #   Layout, Sidebar, ProtectedRoute
│   │   ├── hooks/              #   useAuth, useWebSocket
│   │   ├── pages/              #   Pages:
│   │   │   ├── BusUnpaidTracking.jsx # Bus-wise unpaid tracking dashboard
│   │   │   ├── FaceScan.jsx          # Live ESP32 face scan & boarding check
│   │   │   ├── Students.jsx          # Student roster with receipt upload modal
│   │   │   ├── TravelRecords.jsx     # Travel history with student photos
│   │   │   ├── UnpaidTravels.jsx     # Unpaid travels with student photos
│   │   │   ├── Dashboard.jsx         # KPI overview & recent travels
│   │   │   ├── UnknownFaces.jsx      # Gallery of unrecognized faces
│   │   │   ├── Buses.jsx             # Bus fleet management
│   │   │   └── Reports.jsx           # Analytics & reports
│   │   └── stores/             #   Zustand state stores
│   ├── .env.example            #   Frontend environment template
│   └── vite.config.js          #   Vite configuration
├── .gitignore                  # Comprehensive Git ignore rules for cloud push
└── README.md                   # Project documentation
```

---

## 🔌 API Endpoints Summary

| Method | Endpoint | Description |
|---|---|---|
| **ESP32-CAM** | | |
| `GET` | `/api/v1/esp32/stream` | Piped MJPEG live stream from ESP32-CAM |
| `GET` | `/api/v1/esp32/capture` | Latest single JPEG frame from the camera |
| `GET` | `/api/v1/esp32/status` | Connection status & camera resolution |
| `POST` | `/api/v1/esp32/connect` | Manually set active camera URL |
| `POST` | `/api/v1/esp32/scan` | Auto-discover ESP32-CAM on local network |
| **Face Recognition** | | |
| `POST` | `/api/v1/face/scan` | Verify face frame & record boarding |
| `POST` | `/api/v1/face/register` | Enroll student face embeddings |
| `GET` | `/api/v1/face/unknown` | Retrieve unknown face logs |
| **Bus-Wise Unpaid Tracking** | | |
| `GET` | `/api/v1/bus-unpaid` | List & filter bus unpaid records |
| `GET` | `/api/v1/bus-unpaid/summary` | KPI metrics & bus breakdown |
| `GET` | `/api/v1/bus-unpaid/:id` | Detailed record with boarding timeline |
| `PUT` | `/api/v1/bus-unpaid/:id/resolve` | Resolve record with admin notes |
| `GET` | `/api/v1/bus-unpaid/sync` | Backfill unpaid logs into tracking |
| **Receipts & Photo Extraction** | | |
| `POST` | `/api/v1/receipts/upload` | Upload receipts, OCR & extract student photo |
| `GET` | `/api/v1/receipts` | List uploaded receipts |
| `GET` | `/api/v1/receipts/:id/image` | View full receipt image |
| `GET` | `/api/v1/receipts/:id/photo` | View extracted student passport photo |

---

## 🛠️ Getting Started

### Prerequisites
- **Node.js**: v18 or later (`node -v`)
- **Python**: v3.10 or later (`python --version`)
- **MongoDB**: Community Server installed and running (`mongod`)
- **ESP32-CAM**: Connected to your local Wi-Fi network (default: `http://10.67.1.56`)

---

### Step 1: Start MongoDB
Ensure MongoDB is running locally:
```bash
mongod
# Runs on mongodb://localhost:27017/bus-fee-system
```

---

### Step 2: Configure & Start the Backend

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create your `.env` file from the template:
   ```bash
   copy .env.example .env    # Windows CMD
   # or
   cp .env.example .env      # PowerShell / Linux
   ```
4. Verify settings in `backend/.env`:
   ```ini
   PORT=5000
   MONGODB_URI=mongodb://localhost:27017/bus-fee-system
   ESP32_CAM_URL=http://10.67.1.56
   FACE_MATCH_THRESHOLD=0.65
   AI_SERVICE_URL=http://127.0.0.1:8000
   ```
5. Initialize the default admin user:
   ```bash
   node seed-fresh.js
   ```
   *Default credentials: `admin@college.edu` / `admin123`*
6. Start the backend:
   ```bash
   npm run dev
   ```
   *The backend runs on `http://localhost:5000`.*

---

### Step 3: Configure & Start the AI Service

1. Navigate to the AI service directory:
   ```bash
   cd ../ai-service
   ```
2. Install Python dependencies:
   ```bash
   python -m pip install -r requirements.txt
   python -m pip install --no-deps deepface
   ```
   *(Or simply run `setup.bat` on Windows).*
3. Start the service:
   ```bash
   python main.py
   # or run start.bat
   ```
   *The AI service runs on `http://127.0.0.1:8000`.*
   > **Note**: On the first start, DeepFace downloads the SFace (~37 MB) and YuNet (~230 KB) models to `~/.deepface/weights`. Subsequent runs are 100% offline.

---

### Step 4: Configure & Start the Frontend

1. Navigate to the frontend directory:
   ```bash
   cd ../frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create your `.env` file from the template:
   ```bash
   copy .env.example .env    # Windows CMD
   # or
   cp .env.example .env      # PowerShell / Linux
   ```
4. Start the frontend:
   ```bash
   npm run dev
   ```
   *The frontend runs on `http://localhost:3000` (or `http://localhost:5173`).*

---

## 📸 Using the Face Scan System

1. Log in with `admin@college.edu` / `admin123`.
2. Navigate to **Face Scan** in the sidebar.
3. Select your bus in the dropdown.
4. Click **Start Camera**:
   - The live ESP32-CAM stream displays instantly without black-screen flicker.
   - An interactive face guide oval visually indicates real-time detection status.
5. As passengers step in front of the camera, the system automatically detects their face, verifies payment status, records the boarding in Travel Records, and alerts if fee payment is missing.
6. Unpaid student boardings automatically increment the **Bus-wise Unpaid Tracking** dashboard in real time.
7. To enroll a new student face, switch the tab to **Register Face**, select the student, and click **Register Face**.

---

## ⚙️ Environment Variables Summary

### `backend/.env`
| Variable | Description | Default |
|---|---|---|
| `PORT` | API server port | `5000` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/bus-fee-system` |
| `JWT_SECRET` | Secret key for JWT access tokens | *(Custom string)* |
| `JWT_REFRESH_SECRET` | Secret key for refresh tokens | *(Custom string)* |
| `CORS_ORIGIN` | Allowed CORS origins | `http://localhost:3000,http://localhost:5173` |
| `AI_SERVICE_URL` | URL of the local Python AI service | `http://127.0.0.1:8000` |
| `ESP32_CAM_URL` | IP address of your ESP32-CAM | `http://10.67.1.56` |
| `FACE_MATCH_THRESHOLD` | Cosine similarity threshold for SFace | `0.65` |

### `frontend/.env`
| Variable | Description | Default |
|---|---|---|
| `VITE_API_URL` | Base URL for REST API calls | `http://localhost:5000/api/v1` |
| `VITE_WS_URL` | Base URL for WebSocket connection | `ws://localhost:5000` |

---

## ☁️ Pushing to GitHub Cloud

Follow these steps to safely push your repository to GitHub without leaking sensitive files:

1. **Verify git status**:
   ```bash
   git status
   ```
   Ensure `.env` files, `node_modules`, `*.zip`, `uploads/`, and `.esp32-camera.json` are ignored.
2. **Stage your files**:
   ```bash
   git add .
   ```
3. **Commit changes**:
   ```bash
   git commit -m "feat: add bus-wise unpaid tracking and receipt photo extraction"
   ```
4. **Push to GitHub**:
   ```bash
   git push origin main
   ```

---

## 📄 License
This project is developed for college bus transportation management and verification. All local AI models (OpenCV SFace, YuNet, DeepFace) are open-source.
