# Bus Fee Check System

A full-stack application for managing and monitoring college bus verification, student details, bus routes, travel records, unpaid travel alerts, and reporting.

## 🚀 Tech Stack

### Frontend
- **Framework**: React (Vite)
- **UI Component Library**: Ant Design (antd)
- **State Management**: Zustand
- **Routing**: React Router DOM v6
- **Data Visualization**: Recharts
- **Real-Time Updates**: Socket.io-client

### Backend
- **Runtime**: Node.js & Express
- **Database**: MongoDB (via Mongoose)
- **Real-Time**: Socket.io
- **Security & Authentication**: JWT, bcrypt, Helmet, Express Rate Limit

---

## 📁 Project Structure

```text
├── backend/
│   ├── config/             # Database and server configs
│   ├── controllers/        # Route controllers (Students, Buses, Travel, etc.)
│   ├── middleware/         # Auth & validation middleware
│   ├── models/             # Mongoose schemas (Student, Bus, TravelRecord, etc.)
│   ├── routes/             # API routes
│   ├── services/           # Business logic (Travel Service, etc.)
│   ├── sockets/            # Socket.io handlers
│   ├── seed-fresh.js       # Admin user seeding script
│   └── server.js           # Server entry point
├── frontend/
│   ├── src/
│   │   ├── api/            # Axios API client
│   │   ├── components/     # Reusable layout and common UI components
│   │   ├── hooks/          # Custom hooks (Auth, WebSockets)
│   │   ├── pages/          # Pages (Dashboard, Students, Buses, Travels, Reports, Unpaid)
│   │   ├── stores/         # State management stores
│   │   ├── App.jsx         # Application routing & layout setup
│   │   └── main.jsx        # App entry point
│   ├── index.html
│   └── vite.config.js
├── .gitignore
└── README.md
```

---

## 🛠️ Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v16+ recommended)
- [MongoDB](https://www.mongodb.com/) (running instance or connection URI)

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in `backend/`:
   ```env
   PORT=5000
   MONGODB_URI=mongodb://localhost:27017/bus_fee_check
   JWT_SECRET=your_jwt_secret_key
   CORS_ORIGIN=http://localhost:5173
   RATE_LIMIT_WINDOW=900000
   RATE_LIMIT_MAX=100
   ```

4. Seed the initial Super Admin user:
   ```bash
   node seed-fresh.js
   ```

5. Start the backend server:
   ```bash
   npm run dev
   ```

---

### Frontend Setup

1. Open a new terminal and navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the Vite development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## ✨ Features

- **Dashboard**: Real-time overview of total students, active buses, today's travel records, and unpaid travel statistics.
- **Student Management**: Full CRUD operations for student records, photo uploads, bus assignment, face registration status, and payment status (`Paid`, `Unpaid`, `Pending`).
- **Bus Management**: Track buses, route names, driver information, and assigned student counts.
- **Travel Records & Unpaid Alerts**: Real-time monitoring of boarding logs and flags for repeat offenses.
- **Analytics & Reports**: Daily, weekly, and monthly travel and compliance summaries.
