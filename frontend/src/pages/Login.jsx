import React, { useState, useEffect } from 'react';
import { Form, Input, Button, message } from 'antd';
import { LockOutlined, MailOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { authStore } from '../stores/authStore';

const Login = () => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { setTokens, setUser, isAuthenticated } = authStore();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  const onFinish = async (values) => {
    setLoading(true);
    try {
      const res = await api.post('/auth/login', values);
      const { accessToken, refreshToken, admin } = res.data;
      setTokens(accessToken, refreshToken);
      setUser(admin);
      navigate('/dashboard');
      message.success('Welcome back! Logged in successfully.');
    } catch (error) {
      message.error(error.response?.data?.message || 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-root" role="main">
      {/* Animated background orbs */}
      <div className="login-bg-orb login-bg-orb-1" aria-hidden="true" />
      <div className="login-bg-orb login-bg-orb-2" aria-hidden="true" />

      {/* Glassmorphism Card */}
      <div className="login-card" role="dialog" aria-label="Admin Login">
        {/* Logo Area */}
        <div className="login-logo-area">
          <div className="login-logo-icon" aria-hidden="true">
            <SafetyCertificateOutlined style={{ color: '#fff', fontSize: 28 }} />
          </div>
          <h1 className="login-title">Admin Portal</h1>
          <p className="login-subtitle">Bus Fee Verification System</p>
        </div>

        {/* Login Form */}
        <Form
          onFinish={onFinish}
          layout="vertical"
          autoComplete="on"
          size="large"
        >
          <Form.Item
            name="email"
            rules={[
              { required: true, message: 'Please enter your email' },
              { type: 'email', message: 'Please enter a valid email' },
            ]}
            style={{ marginBottom: 16 }}
          >
            <Input
              prefix={<MailOutlined style={{ color: 'rgba(255,255,255,0.4)', marginRight: 6 }} />}
              placeholder="Admin Email"
              id="login-email"
              autoComplete="email"
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: '#fff',
                borderRadius: 10,
              }}
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: 'Please enter your password' }]}
            style={{ marginBottom: 24 }}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: 'rgba(255,255,255,0.4)', marginRight: 6 }} />}
              placeholder="Password"
              id="login-password"
              autoComplete="current-password"
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: '#fff',
                borderRadius: 10,
              }}
            />
          </Form.Item>

          <Button
            type="primary"
            htmlType="submit"
            loading={loading}
            block
            id="login-submit-btn"
            style={{
              height: 46,
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 15,
              background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
              border: 'none',
              boxShadow: '0 4px 20px rgba(99,102,241,0.5)',
              letterSpacing: '0.01em',
            }}
          >
            {loading ? 'Signing in…' : 'Sign In to Dashboard'}
          </Button>
        </Form>

        {/* Security tagline */}
        <div className="login-footer-text">
          <LockOutlined style={{ marginRight: 5 }} />
          Secure · Encrypted · Authorized access only
        </div>
      </div>
    </div>
  );
};

export default Login;