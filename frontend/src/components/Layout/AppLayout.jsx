import React from 'react';
import { Layout } from 'antd';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

const { Header, Content, Footer } = Layout;

const AppLayout = () => (
  <Layout style={{ minHeight: '100vh' }}>
    <Sidebar />
    <Layout>
      <Header style={{ background: '#fff', padding: '0 20px' }}>
        <h2 style={{ margin: 0 }}>Bus Fee Verification</h2>
      </Header>
      <Content style={{ margin: '16px' }}>
        <Outlet />
      </Content>
      <Footer style={{ textAlign: 'center' }}>©2026 Bus Fee System</Footer>
    </Layout>
  </Layout>
);

export default AppLayout;