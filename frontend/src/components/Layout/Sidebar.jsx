import React from 'react';
import { Layout, Menu } from 'antd';
import { Link, useLocation } from 'react-router-dom';
import {
  DashboardOutlined,
  UserOutlined,
  CarOutlined,
  DollarOutlined,
  FileTextOutlined,
  WarningOutlined,
  BarChartOutlined,
} from '@ant-design/icons';

const { Sider } = Layout;

const Sidebar = () => {
  const location = useLocation();
  const items = [
    { key: '/dashboard', icon: <DashboardOutlined />, label: <Link to="/dashboard">Dashboard</Link> },
    { key: '/students', icon: <UserOutlined />, label: <Link to="/students">Students</Link> },
    { key: '/buses', icon: <CarOutlined />, label: <Link to="/buses">Buses</Link> },
    { key: '/payments', icon: <DollarOutlined />, label: <Link to="/payments">Payments</Link> },
    { key: '/travels', icon: <FileTextOutlined />, label: <Link to="/travels">Travel Records</Link> },
    { key: '/unpaid', icon: <WarningOutlined />, label: <Link to="/unpaid">Unpaid Travels</Link> },
    { key: '/reports', icon: <BarChartOutlined />, label: <Link to="/reports">Reports</Link> },
  ];

  return (
    <Sider theme="dark" style={{ minHeight: '100vh' }}>
      <div style={{ padding: '16px', color: '#fff', fontSize: '18px', fontWeight: 'bold' }}>
        Bus Fee System
      </div>
      <Menu theme="dark" mode="inline" selectedKeys={[location.pathname]} items={items} />
    </Sider>
  );
};

export default Sidebar;