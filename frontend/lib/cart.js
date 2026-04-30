/**
 * lib/cart.js
 * sessionStorage helpers for cart token.
 * All access is guarded by typeof window check (SSR safe).
 */

const KEY = 'curator_cart_token';

export function getToken() {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(KEY);
}

export function setToken(token) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(KEY, token);
}

export function clearToken() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(KEY);
}
