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
import TravelRecords from './pages/TravelRecords';
import UnpaidTravels from './pages/UnpaidTravels';
import Reports from './pages/Reports';

const antdTheme = {
  token: {
    // Brand
    colorPrimary: '#6366f1',
    colorSuccess: '#10b981',
    colorWarning: '#f59e0b',
    colorError:   '#ef4444',
    colorInfo:    '#3b82f6',

    // Typography
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize:   14,
    fontSizeLG: 15,

    // Layout
    borderRadius:   10,
    borderRadiusSM: 6,
    borderRadiusLG: 14,

    // Colors
    colorBgContainer:  '#ffffff',
    colorBgLayout:     '#f1f5f9',
    colorBgElevated:   '#ffffff',
    colorBorder:       '#e2e8f0',
    colorBorderSecondary: '#f1f5f9',
    colorText:         '#0f172a',
    colorTextSecondary:'#64748b',
    colorTextTertiary: '#94a3b8',

    // Controls
    controlHeight:   38,
    controlHeightSM: 30,
    controlHeightLG: 44,
    lineWidth: 1,
  },
  components: {
    Layout: {
      siderBg:        '#0f1117',
      triggerBg:      '#1e2130',
      headerBg:       '#ffffff',
      bodyBg:         '#f1f5f9',
      headerHeight:   64,
    },
    Menu: {
      darkItemBg:           '#0f1117',
      darkSubMenuItemBg:    '#0f1117',
      darkItemSelectedBg:   'rgba(99, 102, 241, 0.18)',
      darkItemHoverBg:      'rgba(99, 102, 241, 0.10)',
      darkItemColor:        '#94a3b8',
      darkItemSelectedColor:'#a5b4fc',
      darkItemHoverColor:   '#e2e8f0',
    },
    Table: {
      borderRadius:       10,
      headerBg:           '#f8fafc',
      headerColor:        '#64748b',
      headerSortActiveBg: '#f1f5f9',
      rowHoverBg:         '#f8f9ff',
      borderColor:        '#e2e8f0',
      cellPaddingBlock:   12,
      cellPaddingInline:  16,
    },
    Card: {
      borderRadius: 12,
      boxShadow:    '0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.04)',
      paddingLG:    24,
    },
    Button: {
      borderRadius:         10,
      fontWeight:           600,
      primaryShadow:        '0 2px 8px rgba(99, 102, 241, 0.35)',
      defaultBorderColor:   '#e2e8f0',
      defaultColor:         '#0f172a',
    },
    Input: {
      borderRadius: 10,
      activeShadow: '0 0 0 3px rgba(99, 102, 241, 0.15)',
    },
    Select: {
      borderRadius: 10,
    },
    Modal: {
      borderRadius: 16,
      titleFontSize: 16,
      titleColor:    '#0f172a',
    },
    Tag: {
      borderRadius: 20,
      fontSizeSM:   12,
    },
    Statistic: {
      titleFontSize:  13,
      contentFontSize:28,
    },
    DatePicker: {
      borderRadius: 10,
    },
    Badge: {
      colorBgContainer: '#ffffff',
    },
  },
};

const App = () => (
  <ConfigProvider theme={antdTheme}>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route index element={<Navigate to="/dashboard" />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="students"  element={<Students />} />
            <Route path="buses"     element={<Buses />} />
            <Route path="travels"   element={<TravelRecords />} />
            <Route path="unpaid"    element={<UnpaidTravels />} />
            <Route path="reports"   element={<Reports />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </ConfigProvider>
);

export default App;