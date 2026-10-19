# Bus Fee Check System 🚌💳

A modern full-stack college bus fee verification system featuring real-time boarding verification, automated student & bus management, fee receipt OCR, unpaid travel alerts, and **on-device AI face recognition** powered by an **ESP32-CAM live video stream**.

Everything runs locally: **no cloud AI, no subscription costs, no API keys, and no GPU required.**

---

## ✨ Key Highlights

- **ESP32-CAM Live Video Stream**:
  - Piped through a high-performance backend proxy (`/api/v1/esp32/stream`), eliminating browser CORS restrictions and mixed-content issues.
  - **Single-connection upstream architecture**: The Node backend maintains one persistent connection to the ESP32-CAM, fanning out frames to both browser clients and AI face capture without choking the camera.
  - **Auto-reconnection & URL Caching**: Remembers the active working candidate endpoint and reconnects in under 100ms.
  - **LAN Camera Discovery**: Scans local subnets for the ESP32-CAM directly from the UI.
- **Real-Time Automated Face Detection & Boarding Check**:
  - Live video guide oval with dynamic status indicator (looking, verifying, fee paid, unpaid, unknown).
  - Automatically captures and evaluates frames when a passenger appears in front of the camera.
  - Compares against enrolled student face templates in MongoDB using **DeepFace SFace** (128-d embeddings) + **YuNet** detection.
  - **Anti-False-Positive Tuning (`threshold = 0.65`)**: Rigorously calibrated so different individuals are not falsely matched to enrolled students.
- **Fee Status Enforcement**:
  - **Paid Students**: Instant green *“Fee Paid — Boarding Allowed”* confirmation and logged in Travel Records.
  - **Unpaid / Pending Students**: Red *“Unpaid Travel Recorded”* alert, logged in Unpaid Travels, with repeat offense tracking (≥3 unresolved offenses highlighted).
- **Unknown Faces Review**:
  - Any unmatched person's face photo is stored directly as binary in MongoDB (no disk files needed) and surfaced in the admin **Unknown Faces** gallery.
- **Receipt OCR**:
  - Bulk upload student payment receipts (Images, PDF, DOCX) with local text extraction via `tesseract.js`, `pdf-parse`, and `mammoth`.
- **Live Dashboard & Real-Time Sync**:
  - Real-time updates pushed to the admin dashboard via Socket.io.
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
- **Helmet**, **CORS**, and **express-rate-limit** (auto-scan endpoints exempt)
- **Tesseract.js**, **pdf-parse**, **mammoth**, and **sharp** for receipt OCR
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
│   ├── controllers/            #   Endpoint logic (face, students, buses, travel, etc.)
│   ├── middleware/             #   JWT auth, RBAC, rate-limiting
│   ├── models/                 #   Mongoose schemas (Student, TravelRecord, FaceRecognitionLog, etc.)
│   ├── routes/                 #   Express route definitions (/esp32, /face, /auth, etc.)
│   ├── services/               #   ESP32 proxy service, FaceAI HTTP client, OCR
│   ├── sockets/                #   Socket.io real-time server
│   ├── seed-fresh.js           #   Admin initialization script
│   ├── .env.example            #   Backend environment template
│   └── server.js               #   Application entry point
├── frontend/                   # React 18 + Vite SPA
│   ├── src/
│   │   ├── api/client.js       #   Axios client with auto-refresh
│   │   ├── components/         #   Layout, Sidebar, ProtectedRoute
│   │   ├── hooks/              #   useAuth, useWebSocket
│   │   ├── pages/              #   FaceScan, Dashboard, Students, Buses, UnknownFaces, etc.
│   │   └── stores/             #   Zustand state stores
│   ├── .env.example            #   Frontend environment template
│   └── vite.config.js          #   Vite configuration
├── .gitignore                  # Git ignore rules
└── README.md                   # Project documentation
```

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
4. Verify or adjust settings in `backend/.env`:
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
3. Verify your bus selection in the dropdown.
4. Click **Start Camera**:
   - The live ESP32-CAM stream displays instantly without black-screen flicker.
   - An interactive face guide oval visually indicates real-time detection status.
5. As passengers step in front of the camera, the system automatically detects their face, verifies payment status, records the boarding in Travel Records, and alerts if fee payment is missing.
6. To enroll a new student face, switch the tab to **Register Face**, select the student, and click **Register Face**.

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
   Ensure `.env` files, `node_modules`, `*.zip`, and `.esp32-camera.json` are ignored.
2. **Stage your files**:
   ```bash
   git add .
   ```
3. **Commit changes**:
   ```bash
   git commit -m "feat: complete ESP32-CAM live stream integration and accurate face recognition"
   ```
4. **Push to GitHub**:
   ```bash
   git push origin main
   ```

---

## 📄 License
This project is developed for college bus transportation management and verification. All local AI models (OpenCV SFace, YuNet, DeepFace) are open-source.
