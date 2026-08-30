import { createContext, useContext, useEffect } from 'react';
import { authStore } from '../stores/authStore';
import api from '../api/client';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const { isAuthenticated, user, setUser, logout } = authStore();

  useEffect(() => {
    if (isAuthenticated) {
      api.get('/auth/me')
        .then(res => setUser(res.data))
        .catch(() => logout());
    }
  }, [isAuthenticated]);

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);