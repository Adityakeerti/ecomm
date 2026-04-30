/**
 * lib/cartUtils.js
 * Cart health check and automatic recreation utilities
 */

import { cartApi } from './api';
import { getToken, setToken, clearToken } from './cart';

/**
 * Ensures cart exists and is valid
 * Returns: { token, isNew } or null if failed
 */
export async function ensureCart() {
  try {
    let token = getToken();
    
    // No token - create new cart
    if (!token) {
      const res = await cartApi.post('/session');
      token = (res.data?.data ?? res.data).token;
      setToken(token);
      return { token, isNew: true };
    }

    // Verify existing cart
    try {
      await cartApi.get(`/${token}`);
      return { token, isNew: false };
    } catch (err) {
      // Cart expired (404) - create new one
      if (err.response?.status === 404) {
        clearToken();
        const res = await cartApi.post('/session');
        token = (res.data?.data ?? res.data).token;
        setToken(token);
        return { token, isNew: true };
      }
      throw err;
    }
  } catch (err) {
    console.error('ensureCart error:', err);
    return null;
  }
}

/**
 * Get cart with automatic recreation if expired
 * Returns: cart data or null
 */
export async function getCartSafe() {
  try {
    const result = await ensureCart();
    if (!result) return null;

    const res = await cartApi.get(`/${result.token}`);
    return res.data?.data ?? res.data;
  } catch (err) {
    console.error('getCartSafe error:', err);
    return null;
  }
}

/**
 * Add item to cart with automatic cart recreation
 * Returns: { success, cart, message }
 */
export async function addToCartSafe(variantId, qty = 1) {
  try {
    const result = await ensureCart();
    if (!result) {
      return { success: false, message: 'Could not create cart session' };
    }

    const { token } = result;

    // Get current cart
    const cartRes = await cartApi.get(`/${token}`);
    const items = cartRes.data?.data?.items ?? [];
    const existing = items.find((i) => i.variant_id === variantId);

    // Add or update item
    if (existing) {
      const res = await cartApi.put(`/${token}/items/${variantId}`, { 
        qty: existing.qty + qty 
      });
      return { 
        success: true, 
        cart: res.data?.data ?? res.data,
        message: 'Cart updated'
      };
    } else {
      const res = await cartApi.post(`/${token}/items`, { 
        variant_id: variantId, 
        qty 
      });
      return { 
        success: true, 
        cart: res.data?.data ?? res.data,
        message: 'Added to cart'
      };
    }
  } catch (err) {
    return { 
      success: false, 
      message: err.response?.data?.message ?? 'Could not add to cart' 
    };
  }
}
