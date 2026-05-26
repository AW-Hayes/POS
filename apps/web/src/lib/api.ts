import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  try {
    const stored = localStorage.getItem('pos_auth');
    const token = stored ? (JSON.parse(stored) as { state?: { token?: string } }).state?.token : null;
    if (token) config.headers.Authorization = `Bearer ${token}`;
  } catch {
    // Malformed storage — ignore, request proceeds unauthenticated
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('pos_auth');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);
