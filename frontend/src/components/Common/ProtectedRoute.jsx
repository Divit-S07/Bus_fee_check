import React from 'react';
import { Navigate } from 'react-router-dom';
import { authStore } from '../../stores/authStore';

const ProtectedRoute = ({ children }) => {
  const isAuthenticated = authStore(state => state.isAuthenticated);
  console.log('ProtectedRoute - isAuthenticated:', isAuthenticated);
  return isAuthenticated ? children : <Navigate to="/login" />;
};

export default ProtectedRoute;