import axios from 'axios';

const BASE = import.meta.env.VITE_ADMIN_API_URL || 'http://localhost:4000';

// Singleton token storage (in-memory — NOT localStorage)
let _token = null;
export const setToken = (t) => { _token = t; };
export const getToken = () => _token;
export const clearToken = () => { _token = null; };

export const adminApi = axios.create({ baseURL: `${BASE}/admin` });
export const authApi  = axios.create({ baseURL: `${BASE}/admin/auth` });
export const v1Api    = axios.create({ baseURL: `${BASE}/v1` });

// Attach token to every adminApi request
adminApi.interceptors.request.use((config) => {
  if (_token) config.headers['Authorization'] = `Bearer ${_token}`;
  return config;
});

// Extract success/error for convenience
adminApi.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      clearToken();
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);
