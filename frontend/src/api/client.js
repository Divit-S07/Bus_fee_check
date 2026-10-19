import axios from 'axios';
import { authStore } from '../stores/authStore';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: { 'Content-Type': 'application/json' },
});

// JWT payload is the middle segment, base64url-encoded
const tokenExpiresAt = (token) => {
  try {
    const payload = JSON.parse(
      atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
    );
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
};

// shared so concurrent requests never fire parallel refreshes
// (the backend rotates refresh tokens - a second use of the old one fails)
let refreshPromise = null;

const refreshTokens = async () => {
  const refreshToken = authStore.getState().refreshToken;
  if (!refreshToken) throw new Error('No refresh token');
  const response = await axios.post(`${import.meta.env.VITE_API_URL}/auth/refresh`, {
    refreshToken,
  });
  const { accessToken, refreshToken: newRefresh } = response.data;
  authStore.getState().setTokens(accessToken, newRefresh);
  return accessToken;
};

const runRefresh = () => {
  if (!refreshPromise) {
    refreshPromise = refreshTokens().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
};

// Refresh 30s before expiry so long-lived pages (FaceScan auto-scan loop,
// Dashboard websocket) never send a request with a dead token.
const REFRESH_MARGIN_MS = 30_000;

api.interceptors.request.use(async (config) => {
  const token = authStore.getState().accessToken;
  const expiresAt = token ? tokenExpiresAt(token) : null;
  if (token && expiresAt && expiresAt - Date.now() < REFRESH_MARGIN_MS) {
    try {
      await runRefresh();
    } catch {
      // let the request go out with the old token - the 401 handler below
      // will retry once and log out cleanly if the session is truly dead
    }
  }
  const fresh = authStore.getState().accessToken;
  if (fresh) config.headers.Authorization = `Bearer ${fresh}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const accessToken = await runRefresh();
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        authStore.getState().logout();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);

export default api;
