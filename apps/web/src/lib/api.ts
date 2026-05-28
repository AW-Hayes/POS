import axios from 'axios';

// In the packaged Tauri app there is no Vite dev proxy, so relative URLs
// like '/api' resolve to tauri://localhost/api and never reach the API server.
// window.__TAURI_INTERNALS__ is injected by the Tauri v2 runtime, so we can
// detect it at runtime and switch to the full server URL.
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const baseURL = isTauri
  ? `${import.meta.env.VITE_API_URL ?? 'http://localhost:3001'}/api`
  : '/api';

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
