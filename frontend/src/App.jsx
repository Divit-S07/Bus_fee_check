import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import { AuthProvider } from './hooks/useAuth';
import ProtectedRoute from './components/Common/ProtectedRoute';
import AppLayout from './components/Layout/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import Buses from './pages/Buses';
import Payments from './pages/Payments';
import TravelRecords from './pages/TravelRecords';
import UnpaidTravels from './pages/UnpaidTravels';
import Reports from './pages/Reports';

const App = () => (
  <ConfigProvider theme={{ token: { colorPrimary: '#1890ff' } }}>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route index element={<Navigate to="/dashboard" />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="students" element={<Students />} />
            <Route path="buses" element={<Buses />} />
            <Route path="payments" element={<Payments />} />
            <Route path="travels" element={<TravelRecords />} />
            <Route path="unpaid" element={<UnpaidTravels />} />
            <Route path="reports" element={<Reports />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </ConfigProvider>
);

export default App;