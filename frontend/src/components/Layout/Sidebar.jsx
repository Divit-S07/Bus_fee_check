import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import busLogo from '../../assets/bus-logo.jpg';
import {
  DashboardOutlined,
  UserOutlined,
  CarOutlined,
  FileTextOutlined,
  WarningOutlined,
  BarChartOutlined,
  ScanOutlined,
} from '@ant-design/icons';

const NAV_ITEMS = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: 'Dashboard' },
  { key: '/students',  icon: <UserOutlined />,      label: 'Students' },
  { key: '/buses',     icon: <CarOutlined />,        label: 'Buses' },
  { key: '/face-scan', icon: <ScanOutlined />,       label: 'Face Scan' },
  { key: '/travels',   icon: <FileTextOutlined />,   label: 'Travel Records' },
  { key: '/unpaid',    icon: <WarningOutlined />,    label: 'Unpaid Travels' },
  { key: '/reports',   icon: <BarChartOutlined />,   label: 'Reports' },
];

const Sidebar = ({ collapsed, onCollapse }) => {
  const location = useLocation();

  const sidebarWidth = collapsed ? 64 : 220;

  return (
    <aside
      className="custom-sidebar"
      style={{ width: sidebarWidth, minWidth: sidebarWidth, transition: 'width 0.25s ease', position: 'relative' }}
      aria-label="Main navigation"
    >
      {/* Brand */}
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon" aria-hidden="true">
          <img src={busLogo} alt="Bus Logo" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '4px' }} />
        </div>
        {!collapsed && (
          <div>
            <div className="sidebar-brand-text">BusTrack</div>
            <div className="sidebar-brand-sub">Admin Portal</div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav" aria-label="Primary navigation">
        {!collapsed && (
          <div className="sidebar-section-label">Main Menu</div>
        )}

        {NAV_ITEMS.map((item) => {
          const isActive = location.pathname === item.key;
          return (
            <Link
              key={item.key}
              to={item.key}
              className={`sidebar-nav-item${isActive ? ' active' : ''}`}
              title={collapsed ? item.label : undefined}
              aria-current={isActive ? 'page' : undefined}
              style={collapsed ? { justifyContent: 'center', padding: '9px 0' } : undefined}
            >
              <span className="sidebar-nav-icon" aria-hidden="true">
                {item.icon}
              </span>
              {!collapsed && (
                <span className="sidebar-nav-label">{item.label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        {!collapsed && (
          <div className="sidebar-version">v1.0.0 · Bus Fee System</div>
        )}
        {collapsed && (
          <div style={{ textAlign: 'center', fontSize: 10, color: '#2d3555' }}>v1.0</div>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;