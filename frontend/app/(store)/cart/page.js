'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { cartApi } from '@/lib/api';
import { getToken, clearToken } from '@/lib/cart';
import { formatPrice, notifyCartUpdate } from '@/lib/format';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function CartPage() {
  const [cart, setCart]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [updating, setUpdating] = useState(null); // variantId being updated
  const [token, setToken] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setToken(getToken());
    setHydrated(true);
  }, []);

  const fetchCart = async (t = token) => {
    if (!t) { setLoading(false); return; }
    try {
      const res = await cartApi.get(`/${t}`);
      setCart(res.data?.data ?? res.data);
      setError(null);
    } catch (err) {
      if (err.response?.status === 404) {
        // Cart expired - clear token and show empty state
        clearToken();
        setToken(null);
        setCart(null);
        setError('Your cart session expired. Items have been cleared.');
        notifyCartUpdate();
      } else {
        setError('Could not load cart.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!hydrated) return;
    fetchCart(token);
  }, [hydrated, token]);

  const updateQty = async (variantId, newQty) => {
    if (newQty < 1) return removeItem(variantId);
    setUpdating(variantId);
    try {
      const res = await cartApi.put(`/${token}/items/${variantId}`, { qty: newQty });
      setCart(res.data?.data ?? res.data);
      notifyCartUpdate();
    } catch (err) {
      if (err.response?.status === 404) {
        // Cart expired
        clearToken();
        setToken(null);
        setCart(null);
        setError('Your cart session expired. Items have been cleared.');
        notifyCartUpdate();
      } else {
        alert(err.response?.data?.message ?? 'Could not update quantity.');
      }
    } finally {
      setUpdating(null);
    }
  };

  const removeItem = async (variantId) => {
    setUpdating(variantId);
    try {
      const res = await cartApi.delete(`/${token}/items/${variantId}`);
      setCart(res.data?.data ?? res.data);
      notifyCartUpdate();
    } catch (err) {
      if (err.response?.status === 404) {
        // Cart expired
        clearToken();
        setToken(null);
        setCart(null);
        setError('Your cart session expired. Items have been cleared.');
        notifyCartUpdate();
      } else {
        alert('Could not remove item.');
      }
    } finally {
      setUpdating(null);
    }
  };

  if (!hydrated || loading) return <LoadingSpinner />;

  // Empty states
  if (!token || error) {
    return (
      <div style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
        <span className="material-symbols-rounded" style={{ fontSize: '3.5rem', color: 'var(--outline)', display: 'block', marginBottom: '1rem' }}>shopping_bag</span>
        <h2 className="headline-md" style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Your bag is empty</h2>
        {error && <p className="body-md" style={{ color: 'var(--error)', fontSize: '0.875rem', marginBottom: '1rem' }}>{error}</p>}
        <Link href="/shop">
          <button className="btn-primary" style={{ padding: '0.875rem 2rem', marginTop: '1rem' }}>Start Shopping</button>
        </Link>
      </div>
    );
  }

  if (!cart || !cart.items || cart.items.length === 0) {
    return (
      <div style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
        <span className="material-symbols-rounded" style={{ fontSize: '3.5rem', color: 'var(--outline)', display: 'block', marginBottom: '1rem' }}>shopping_bag</span>
        <h2 className="headline-md" style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Your bag is empty</h2>
        <Link href="/shop">
          <button className="btn-primary" style={{ padding: '0.875rem 2rem', marginTop: '1rem' }}>Start Shopping</button>
        </Link>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <h1 className="heading-serif" style={{ fontSize: '2rem', marginBottom: '1rem' }}>Your Bag</h1>

      {/* Items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
        {cart.items.map(item => (
          <div key={item.variant_id} style={{
            background: 'var(--surface-white)',
            border: '1px solid var(--outline-variant)',
            padding: '1rem',
            display: 'flex',
            gap: '0.75rem',
            opacity: updating === item.variant_id ? 0.55 : 1,
            transition: 'opacity 0.2s',
          }}>
            {/* Placeholder image */}
            <div style={{
              width: '72px', flexShrink: 0, aspectRatio: '2/3',
              background: 'var(--surface-high)', border: '1px solid var(--outline-variant)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span className="material-symbols-rounded" style={{ fontSize: '1.75rem', color: 'var(--outline)' }}>checkroom</span>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: '0.9375rem', marginBottom: '0.25rem' }}>
                {item.product_name}
              </p>
              <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.625rem' }}>
                {item.size && <span className="chip chip-inactive" style={{ fontSize: '0.65rem', padding: '0.15rem 0.5rem' }}>{item.size}</span>}
                {item.colour && <span className="chip chip-inactive" style={{ fontSize: '0.65rem', padding: '0.15rem 0.5rem' }}>{item.colour}</span>}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                {/* Qty stepper */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <button
                    onClick={() => updateQty(item.variant_id, item.qty - 1)}
                    disabled={updating === item.variant_id}
                    style={{ width: '28px', height: '28px', borderRadius: '50%', border: 'none', background: 'var(--surface-high)', cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: '1rem' }}
                  >−</button>
                  <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, minWidth: '1.5rem', textAlign: 'center' }}>{item.qty}</span>
                  <button
                    onClick={() => updateQty(item.variant_id, item.qty + 1)}
                    disabled={updating === item.variant_id}
                    style={{ width: '28px', height: '28px', borderRadius: '50%', border: 'none', background: 'var(--surface-high)', cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: '1rem' }}
                  >+</button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <p style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: '0.9375rem' }}>
                    {formatPrice(item.price_paise * item.qty)}
                  </p>
                  <button
                    onClick={() => removeItem(item.variant_id)}
                    disabled={updating === item.variant_id}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--outline)', padding: '0.25rem' }}
                  >
                    <span className="material-symbols-rounded" style={{ fontSize: '1.125rem' }}>close</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Summary */}
      <div style={{ background: 'var(--surface-white)', border: '1px solid var(--on-surface)', padding: '1.25rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <span className="body-md" style={{ color: 'var(--on-surface-variant)', fontSize: '0.9375rem' }}>Subtotal</span>
          <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700 }}>{formatPrice(cart.cart_total_paise)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <span className="body-md" style={{ color: 'var(--on-surface-variant)', fontSize: '0.9375rem' }}>Delivery</span>
          <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 600, color: 'var(--primary)', fontSize: '0.875rem' }}>Calculated at checkout</span>
        </div>
        <Link href="/checkout">
          <button className="btn-primary" style={{ width: '100%', padding: '1rem', fontSize: '0.9375rem' }}>
            Proceed to Checkout
          </button>
        </Link>
      </div>

      <Link href="/shop" className="btn-ghost" style={{ display: 'block', textAlign: 'center', padding: '0.5rem' }}>
        Continue Shopping
      </Link>
    </div>
  );
}
