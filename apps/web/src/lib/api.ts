import axios from 'axios';

// In the packaged Tauri app there is no Vite dev proxy, so relative '/api'
// never reaches the API server. TAURI_ENV_PLATFORM is injected by tauri-cli
// at build time (exposed via envPrefix in vite.config.ts), so it's a reliable
// indicator that we're running as a native app and need the full server URL.
const isTauri =
  Boolean(import.meta.env.TAURI_ENV_PLATFORM) ||
  (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window);
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
