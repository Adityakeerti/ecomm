import axios from 'axios';

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// ── Admin token — persisted in sessionStorage so it survives page navigations ──
const ADMIN_TOKEN_KEY  = 'curator_admin_token';
const ADMIN_INFO_KEY   = 'curator_admin_info';
let _adminToken = (typeof window !== 'undefined' ? sessionStorage.getItem(ADMIN_TOKEN_KEY) : null);
export const getAdminToken   = () => _adminToken;
export const setAdminToken   = (t) => { _adminToken = t; if (typeof window !== 'undefined') sessionStorage.setItem(ADMIN_TOKEN_KEY, t ?? ''); };
export const clearAdminToken = () => { _adminToken = null; if (typeof window !== 'undefined') { sessionStorage.removeItem(ADMIN_TOKEN_KEY); sessionStorage.removeItem(ADMIN_INFO_KEY); } };
export const setAdminInfo    = (info) => { if (typeof window !== 'undefined') sessionStorage.setItem(ADMIN_INFO_KEY, JSON.stringify(info)); };
export const getAdminInfo    = () => { if (typeof window === 'undefined') return null; try { const s = sessionStorage.getItem(ADMIN_INFO_KEY); return s ? JSON.parse(s) : null; } catch { return null; } };

// EMP token in sessionStorage (delivery)
export const getEmpToken  = () => (typeof window !== 'undefined' ? sessionStorage.getItem('curator_emp_token') : null);
export const setEmpToken  = (t) => sessionStorage.setItem('curator_emp_token', t);
export const clearEmpToken= () => sessionStorage.removeItem('curator_emp_token');

// Storefront user auth (separate from admin + delivery)
const USER_TOKEN_KEY = 'curator_user_token';
const USER_INFO_KEY = 'curator_user_info';
let _userToken = (typeof window !== 'undefined' ? localStorage.getItem(USER_TOKEN_KEY) : null);
export const getUserToken = () => _userToken;
export const setUserToken = (token) => {
  _userToken = token || null;
  if (typeof window === 'undefined') return;
  if (token) localStorage.setItem(USER_TOKEN_KEY, token);
  else localStorage.removeItem(USER_TOKEN_KEY);
};
export const clearUserToken = () => {
  _userToken = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem(USER_TOKEN_KEY);
    localStorage.removeItem(USER_INFO_KEY);
  }
};
export const setUserInfo = (info) => {
  if (typeof window !== 'undefined') localStorage.setItem(USER_INFO_KEY, JSON.stringify(info || {}));
};
export const getUserInfo = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(USER_INFO_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

// Admin API instance (hits /admin/* and /admin/auth/*)
export const adminApi = axios.create({ baseURL: `${BASE}/admin` });

// Delivery API instance (hits /delivery/*)
export const deliveryApi = axios.create({ baseURL: `${BASE}/delivery` });

// Storefront v1 (existing) — exported as both `api` and `v1` for backwards compat
export const api = axios.create({ baseURL: `${BASE}/v1` });
export const v1 = api; // alias used by existing storefront pages

// Root-level storefront APIs (NOT under /v1)
export const cartApi      = axios.create({ baseURL: `${BASE}/cart` });
export const checkoutApi  = axios.create({ baseURL: `${BASE}/checkout` });
export const paymentsApi  = axios.create({ baseURL: `${BASE}/payments` });
export const ordersApi    = axios.create({ baseURL: `${BASE}/orders` });
export const trackApi     = axios.create({ baseURL: `${BASE}/track` });
export const returnsApi   = axios.create({ baseURL: `${BASE}/returns` });
export const userApi      = axios.create({ baseURL: `${BASE}/auth` });

// Attach JWT to admin requests
adminApi.interceptors.request.use((config) => {
  if (_adminToken) config.headers['Authorization'] = `Bearer ${_adminToken}`;
  return config;
});

// 401 on admin → clear token (client-side only)
adminApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      clearAdminToken();
      window.location.href = '/admin/login';
    }
    return Promise.reject(err);
  }
);

// Attach EMP session token to delivery requests (backend reads x-session-token)
deliveryApi.interceptors.request.use((config) => {
  const token = getEmpToken();
  if (token) config.headers['x-session-token'] = token;
  return config;
});

userApi.interceptors.request.use((config) => {
  if (_userToken) config.headers['Authorization'] = `Bearer ${_userToken}`;
  return config;
});
