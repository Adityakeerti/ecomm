import axios from 'axios';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const SESSION_KEY = 'delivery_emp_token';

export const getEmpToken = () => sessionStorage.getItem(SESSION_KEY);
export const setEmpToken = (t) => sessionStorage.setItem(SESSION_KEY, t);
export const clearEmpToken = () => sessionStorage.removeItem(SESSION_KEY);

export const deliveryApi = axios.create({ baseURL: `${BASE}/delivery` });

// Attach token
deliveryApi.interceptors.request.use((config) => {
  const token = getEmpToken();
  if (token) config.headers['Authorization'] = `Bearer ${token}`;
  return config;
});
