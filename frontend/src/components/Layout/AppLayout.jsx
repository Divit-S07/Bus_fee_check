import React, { useState } from 'react';
import { Dropdown, Avatar, Badge, Tooltip } from 'antd';
import {
  LogoutOutlined,
  UserOutlined,
  BellOutlined,
  MenuUnfoldOutlined,
  MenuFoldOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { authStore } from '../../stores/authStore';

const PAGE_TITLES = {
  '/dashboard': { title: 'Dashboard',      subtitle: 'Real-time overview of your bus fleet' },
  '/students':  { title: 'Students',       subtitle: 'Manage student records and fee status' },
  '/buses':     { title: 'Buses',          subtitle: 'Fleet management and route details' },
  '/travels':   { title: 'Travel Records', subtitle: 'All boarding logs and travel history' },
  '/unpaid':    { title: 'Unpaid Travels', subtitle: 'Flagged trips requiring resolution' },
  '/reports':   { title: 'Reports',        subtitle: 'Analytics and compliance summaries' },
};

const AppLayout = () => {
  const { user, logout } = authStore();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const pageInfo = PAGE_TITLES[location.pathname] || { title: 'Admin Portal', subtitle: '' };

  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: <span style={{ fontSize: 13 }}>My Profile</span>,
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: <span style={{ fontSize: 13 }}>Settings</span>,
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: <span style={{ fontSize: 13, color: '#ef4444' }}>Logout</span>,
      danger: true,
      onClick: logout,
    },
  ];

  const displayName = user ? `${user.firstName} ${user.lastName}` : 'Admin';
  const initials = user
    ? `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase()
    : 'A';

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg)' }}>
      <Sidebar collapsed={collapsed} onCollapse={setCollapsed} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Top Bar */}
        <header className="top-bar">
          <div className="top-bar-left">
            <button
              className="top-bar-icon-btn"
              onClick={() => setCollapsed(!collapsed)}
              aria-label="Toggle sidebar"
              style={{ border: 'none', fontSize: 16 }}
            >
              {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            </button>
            <div>
              <div className="top-bar-title">{pageInfo.title}</div>
              {pageInfo.subtitle && (
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.3 }}>
                  {pageInfo.subtitle}
                </div>
              )}
            </div>
          </div>

          <div className="top-bar-right">
            <Tooltip title="Notifications">
              <Badge count={0} size="small">
                <button className="top-bar-icon-btn" aria-label="Notifications">
                  <BellOutlined style={{ fontSize: 16 }} />
                </button>
              </Badge>
            </Tooltip>

            <Dropdown menu={{ items: userMenuItems }} trigger={['click']} placement="bottomRight">
              <div className="user-chip" role="button" tabIndex={0} aria-label="User menu">
                <Avatar
                  size={28}
                  style={{
                    background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                    fontSize: 11,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {initials}
                </Avatar>
                <span className="user-name">{displayName}</span>
              </div>
            </Dropdown>
          </div>
        </header>

        {/* Page Content */}
        <main
          style={{
            flex: 1,
            padding: '24px',
            overflowY: 'auto',
            overflowX: 'hidden',
          }}
        >
          <div className="animate-fade-in-up" key={location.pathname}>
            <Outlet />
          </div>
        </main>

        {/* Footer */}
        <footer
          style={{
            textAlign: 'center',
            padding: '10px 24px',
            fontSize: 12,
            color: 'var(--color-text-muted)',
            borderTop: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
          }}
        >
          © {new Date().getFullYear()} Bus Fee Verification System · All rights reserved
        </footer>
      </div>
    </div>
  );
};

export default AppLayout;