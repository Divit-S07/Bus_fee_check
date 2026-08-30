import React, { useState, useEffect } from 'react';
import { Form, Input, Button, Card, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { authStore } from '../stores/authStore';

const Login = () => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { setTokens, setUser, isAuthenticated } = authStore();

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      console.log('Already authenticated, redirecting to /dashboard');
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  const onFinish = async (values) => {
    setLoading(true);
    try {
      const res = await api.post('/auth/login', values);
      console.log('Login response:', res.data);
      const { accessToken, refreshToken, admin } = res.data;
      
      // Set state
      setTokens(accessToken, refreshToken);
      setUser(admin);
      
      // Check if state updated
      console.log('After setTokens, isAuthenticated:', authStore.getState().isAuthenticated);
      
      // Navigate (will also trigger useEffect above)
      navigate('/dashboard');
      message.success('Login successful');
    } catch (error) {
      console.error('Login error:', error.response?.data || error.message);
      message.error(error.response?.data?.message || 'Invalid credentials');
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