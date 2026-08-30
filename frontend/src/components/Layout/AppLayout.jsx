import React from 'react';
import { Layout, Button, Space, Avatar } from 'antd';
import { LogoutOutlined, UserOutlined } from '@ant-design/icons';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { authStore } from '../../stores/authStore';

const { Header, Content, Footer } = Layout;

const AppLayout = () => {
  const { user, logout } = authStore();

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sidebar />
      <Layout>
        <Header style={{ background: '#fff', padding: '0 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Bus Fee Verification</h2>
          <Space size="middle">
            <Space>
              <Avatar icon={<UserOutlined />} />
              <span>{user ? `${user.firstName} ${user.lastName}` : 'Admin'}</span>
            </Space>
            <Button icon={<LogoutOutlined />} danger onClick={logout}>
              Logout
            </Button>
          </Space>
        </Header>
        <Content style={{ margin: '16px' }}>
          <Outlet />
        </Content>
        <Footer style={{ textAlign: 'center' }}>©2026 Bus Fee System</Footer>
      </Layout>
    </Layout>
  );
};

export default AppLayout;