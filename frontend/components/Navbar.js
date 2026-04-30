'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cartApi, clearUserToken, getUserInfo, getUserToken, setUserInfo, userApi } from '@/lib/api';
import { getToken, clearToken } from '@/lib/cart';

export default function Navbar() {
  const [cartCount, setCartCount] = useState(0);
  const [user, setUser] = useState(null);
  const pathname = usePathname();
  const router = useRouter();

  const fetchCartCount = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setCartCount(0);
      return;
    }
    try {
      const res = await cartApi.get(`/${token}`);
      setCartCount(res.data?.data?.items?.length ?? 0);
    } catch (err) {
      // Cart expired or not found - clear token
      if (err.response?.status === 404) {
        clearToken();
      }
      setCartCount(0);
    }
  }, []);

  useEffect(() => {
    fetchCartCount();
    window.addEventListener('cart-updated', fetchCartCount);
    return () => window.removeEventListener('cart-updated', fetchCartCount);
  }, [fetchCartCount]);

  useEffect(() => {
    const hydrateUser = async () => {
      const token = getUserToken();
      if (!token) {
        setUser(null);
        return;
      }
      const cachedUser = getUserInfo();
      if (cachedUser) setUser(cachedUser);
      try {
        const res = await userApi.get('/me');
        const me = res.data?.data ?? null;
        if (me) {
          setUser(me);
          setUserInfo(me);
        }
      } catch {
        clearUserToken();
        setUser(null);
      }
    };
    hydrateUser();
    window.addEventListener('user-auth-changed', hydrateUser);
    return () => window.removeEventListener('user-auth-changed', hydrateUser);
  }, []);

  const handleLogout = () => {
    clearUserToken();
    clearToken();
    setUser(null);
    setCartCount(0);
    window.dispatchEvent(new Event('cart-updated'));
    router.push('/');
  };

  return (
    <nav className="glass-nav" style={{ position: 'sticky', top: 0, zIndex: 100, borderBottom: '1px solid var(--on-surface)' }}>
      <div style={{ maxWidth: '1440px', margin: '0 auto', height: '4rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.25rem' }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <span className="heading-serif" style={{ fontWeight: 700, fontSize: '1.4rem', letterSpacing: '-0.02em', color: 'var(--on-surface)' }}>CURATOR</span>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Link href="/shop" className="label-caps" style={{ color: pathname === '/shop' ? 'var(--primary)' : 'var(--on-surface-variant)', textDecoration: 'none' }}>Shop</Link>
          <Link href="/track" className="label-caps" style={{ color: pathname === '/track' ? 'var(--primary)' : 'var(--on-surface-variant)', textDecoration: 'none' }}>Track</Link>
          <Link href="/account" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }} aria-label={user ? 'Account' : 'Sign in'}>
            <span className="material-symbols-rounded" style={{ fontSize: '1.4rem', color: pathname === '/account' ? 'var(--primary)' : 'var(--on-surface-variant)' }}>
              {user ? 'account_circle' : 'login'}
            </span>
          </Link>
          <Link href="/cart" style={{ position: 'relative', textDecoration: 'none' }}>
            <span className="material-symbols-rounded" style={{ fontSize: '1.5rem', color: pathname === '/cart' ? 'var(--primary)' : 'var(--on-surface)' }}>shopping_bag</span>
            {cartCount > 0 && <span style={{ position: 'absolute', top: '-6px', right: '-6px', background: 'var(--primary)', color: '#fff', borderRadius: '999px', width: '16px', height: '16px', display: 'grid', placeItems: 'center', fontSize: '0.6rem', fontWeight: 700 }}>{cartCount}</span>}
          </Link>
        </div>
      </div>
    </nav>
  );
}
