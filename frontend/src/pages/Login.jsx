import React, { useState } from 'react';
import { Form, Input, Button, Card, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { authStore } from '../stores/authStore';

const Login = () => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const setTokens = authStore(state => state.setTokens);
  const setUser = authStore(state => state.setUser);

  const onFinish = async (values) => {
    setLoading(true);
    try {
      const res = await api.post('/auth/login', values);
      const { accessToken, refreshToken, admin } = res.data;
      setTokens(accessToken, refreshToken);
      setUser(admin);
      navigate('/dashboard');
    } catch (error) {
      message.error('Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <Card title="Admin Login" style={{ width: 400 }}>
        <Form onFinish={onFinish} layout="vertical">
          <Form.Item name="email" rules={[{ required: true, type: 'email' }]}>
            <Input placeholder="Email" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true }]}>
            <Input.Password placeholder="Password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block>
            Login
          </Button>
        </Form>
      </Card>
    </div>
  );
};

export default Login;