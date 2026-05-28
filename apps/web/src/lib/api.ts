import axios from 'axios';

// Use the full server URL so this works in both browser dev and the packaged
// Tauri app (which has no Vite proxy). The API has CORS open to '*' in dev.
// Set VITE_API_URL at build time to point at a remote server if needed.
// Use 127.0.0.1 (not localhost) — on Windows, WebView2 resolves "localhost"
// to ::1 (IPv6) while Node.js listens on 0.0.0.0 (IPv4), causing connection failures.
const baseURL = `${import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3001'}/api`;

export const api = axios.create({
  baseURL,
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
