'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { v1, cartApi } from '@/lib/api';
import { getToken, setToken } from '@/lib/cart';
import { formatPrice, notifyCartUpdate } from '@/lib/format';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function ProductDetailPage() {
  const { slug } = useParams();
  const router = useRouter();

  const [product,  setProduct]  = useState(null);
  const [variants, setVariants] = useState([]);
  const [selected, setSelected] = useState(null);   // selected variant object
  const [loading,  setLoading]  = useState(true);
  const [adding,   setAdding]   = useState(false);
  const [feedback, setFeedback] = useState(null);   // { type: 'success'|'error', msg }

  // ── Fetch product + variants ─────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const [prodRes, varRes] = await Promise.all([
        v1.get(`/products/${slug}`),
        v1.get(`/products/${slug}/variants`),
      ]);
      const prod = prodRes.data?.data ?? prodRes.data;
      const vars = varRes.data?.data ?? varRes.data ?? [];
      setProduct(prod);
      setVariants(vars);
      // Auto-select first variant with stock
      const firstInStock = vars.find(v => parseInt(v.available_stock) > 0) ?? vars[0] ?? null;
      setSelected(firstInStock);
    } catch {
      setFeedback({ type: 'error', msg: 'Could not load product.' });
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  // ── Add to Cart ──────────────────────────────────────────────────
  const addToCart = async () => {
    if (!selected) return;
    if (parseInt(selected.available_stock) < 1) {
      setFeedback({ type: 'error', msg: 'Out of stock.' });
      return;
    }

    setAdding(true);
    setFeedback(null);

    try {
      // Get or create cart session
      let token = getToken();
      if (!token) {
        const sessionRes = await cartApi.post('/session');
        token = (sessionRes.data?.data ?? sessionRes.data).token;
        setToken(token);
      }

      // Try to get cart, if 404 then cart expired - create new one
      let cartRes;
      try {
        cartRes = await cartApi.get(`/${token}`);
      } catch (err) {
        if (err.response?.status === 404) {
          // Cart expired, create new session
          const sessionRes = await cartApi.post('/session');
          token = (sessionRes.data?.data ?? sessionRes.data).token;
          setToken(token);
          cartRes = await cartApi.get(`/${token}`);
        } else {
          throw err;
        }
      }

      // Add item, or increase quantity if already present
      const items = cartRes.data?.data?.items ?? [];
      const existing = items.find((i) => i.variant_id === selected.id);
      if (existing) {
        await cartApi.put(`/${token}/items/${selected.id}`, { qty: existing.qty + 1 });
      } else {
        await cartApi.post(`/${token}/items`, {
          variant_id: selected.id,
          qty: 1,
        });
      }

      notifyCartUpdate();
      setFeedback({ type: 'success', msg: existing ? 'Bag quantity updated!' : 'Added to bag!' });

      // Refresh stock counts
      const varRes = await v1.get(`/products/${slug}/variants`);
      setVariants(varRes.data?.data ?? varRes.data ?? []);
      // Update selected with fresh stock
      const fresh = (varRes.data?.data ?? varRes.data ?? []).find(v => v.id === selected.id);
      if (fresh) setSelected(fresh);

    } catch (err) {
      const msg = err.response?.data?.message ?? 'Could not add to cart.';
      setFeedback({ type: 'error', msg });
    } finally {
      setAdding(false);
    }
  };

  // ── Render states ────────────────────────────────────────────────
  if (loading) return <LoadingSpinner />;

  if (!product) return (
    <div style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
      <p style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", color: 'var(--error)' }}>
        Product not found. <Link href="/shop" style={{ color: 'var(--primary)' }}>Back to shop</Link>
      </p>
    </div>
  );

  const inStock = selected && parseInt(selected.available_stock) > 0;

  // Group variants by colour then size for display
  const colours = [...new Set(variants.map(v => v.colour).filter(Boolean))];
  const sizes   = [...new Set(variants.map(v => v.size).filter(Boolean))];
  const hasVariantOptions = colours.length > 0 || sizes.length > 0;

  return (
    <div className="page-shell" style={{ paddingBottom: '7rem' }}>
      {/* ── Product Image ────────────────────────── */}
      <div style={{ position: 'relative', background: 'var(--surface-high)', aspectRatio: '4/5', overflow: 'hidden', border: '1px solid var(--outline-variant)' }}>
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-symbols-rounded" style={{ fontSize: '5rem', color: 'var(--outline)' }}>checkroom</span>
          </div>
        )}
        {/* Back button */}
        <button
          onClick={() => router.back()}
          style={{
            position: 'absolute', top: '1rem', left: '1rem',
            background: 'rgba(255,255,255,0.85)', border: 'none',
            borderRadius: '50%', width: '2.25rem', height: '2.25rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', backdropFilter: 'blur(8px)',
          }}
        >
          <span className="material-symbols-rounded" style={{ fontSize: '1.125rem' }}>arrow_back</span>
        </button>
      </div>

      {/* ── Product Info ─────────────────────────── */}
      <div style={{ padding: '1.25rem 0 0' }}>
        {product.category && (
          <span className="label-md" style={{ color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.7rem' }}>
            {product.category}
          </span>
        )}
        <h1 className="heading-serif" style={{ fontSize: '2rem', lineHeight: 1.1, marginTop: '0.25rem', marginBottom: '0.5rem' }}>
          {product.name}
        </h1>
        <p style={{
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontWeight: 700, fontSize: '1.375rem',
          color: 'var(--primary)',
        }}>
          {formatPrice(selected?.price_paise ?? product.base_price_paise)}
        </p>

        {product.description && (
          <p style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: '0.9rem', color: 'var(--on-surface-variant)',
            lineHeight: 1.6, marginTop: '0.75rem',
          }}>
            {product.description}
          </p>
        )}
      </div>

      {/* ── Variant Selectors ────────────────────── */}
      {hasVariantOptions && (
        <div style={{ padding: '1.25rem 1.25rem 0' }}>
          {/* Colour filter */}
          {colours.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <p className="label-md" style={{ color: 'var(--on-surface-variant)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Colour{selected?.colour ? ` — ${selected.colour}` : ''}
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {colours.map(col => {
                  const colVariant = variants.find(v =>
                    v.colour === col && (!selected?.size || v.size === selected.size)
                  ) ?? variants.find(v => v.colour === col);
                  const active = selected?.colour === col;
                  const outOfStock = colVariant && parseInt(colVariant.available_stock) < 1;
                  return (
                    <button
                      key={col}
                      onClick={() => colVariant && setSelected(colVariant)}
                      disabled={!colVariant}
                      className={`chip ${active ? 'chip-active' : 'chip-inactive'}`}
                      style={{
                        opacity: outOfStock ? 0.45 : 1,
                        textDecoration: outOfStock ? 'line-through' : 'none',
                      }}
                    >
                      {col}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Size filter */}
          {sizes.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <p className="label-md" style={{ color: 'var(--on-surface-variant)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Size{selected?.size ? ` — ${selected.size}` : ''}
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {sizes.map(sz => {
                  const szVariant = variants.find(v =>
                    v.size === sz && (!selected?.colour || v.colour === selected.colour)
                  ) ?? variants.find(v => v.size === sz);
                  const active = selected?.size === sz;
                  const outOfStock = szVariant && parseInt(szVariant.available_stock) < 1;
                  return (
                    <button
                      key={sz}
                      onClick={() => szVariant && setSelected(szVariant)}
                      disabled={!szVariant}
                      className={`chip ${active ? 'chip-active' : 'chip-inactive'}`}
                      style={{
                        minWidth: '2.5rem', textAlign: 'center',
                        opacity: outOfStock ? 0.45 : 1,
                        textDecoration: outOfStock ? 'line-through' : 'none',
                      }}
                    >
                      {sz}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* No variants — single default variant */}
      {!hasVariantOptions && variants.length === 1 && (
        <div style={{ padding: '0.5rem 1.25rem 0' }}>
          <p className="label-md" style={{
            color: inStock ? '#065F46' : 'var(--error)',
            display: 'flex', alignItems: 'center', gap: '0.25rem',
          }}>
            <span className="material-symbols-rounded" style={{ fontSize: '1rem' }}>
              {inStock ? 'check_circle' : 'cancel'}
            </span>
            {inStock ? `${selected.available_stock} in stock` : 'Out of stock'}
          </p>
        </div>
      )}

      {/* ── Feedback Banner ──────────────────────── */}
      {feedback && (
        <div style={{
          margin: '1rem 1.25rem 0',
          padding: '0.875rem 1rem',
          borderRadius: '0.5rem',
          background: feedback.type === 'success' ? '#D1FAE5' : 'var(--error-container)',
          color: feedback.type === 'success' ? '#065F46' : 'var(--error)',
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontWeight: 600, fontSize: '0.875rem',
          display: 'flex', alignItems: 'center', gap: '0.5rem',
        }}>
          <span className="material-symbols-rounded" style={{ fontSize: '1.125rem' }}>
            {feedback.type === 'success' ? 'check_circle' : 'error'}
          </span>
          {feedback.msg}
          {feedback.type === 'success' && (
            <Link href="/cart" style={{ marginLeft: 'auto', color: '#065F46', fontWeight: 700, textDecoration: 'underline', fontSize: '0.8125rem' }}>
              View Bag →
            </Link>
          )}
        </div>
      )}

      {/* ── Stock indicator for selected variant ─── */}
      {selected && hasVariantOptions && (
        <div style={{ padding: '0.75rem 1.25rem 0' }}>
          <p className="label-md" style={{
            color: inStock ? '#065F46' : 'var(--error)',
            display: 'flex', alignItems: 'center', gap: '0.25rem',
            fontSize: '0.8rem',
          }}>
            <span className="material-symbols-rounded" style={{ fontSize: '0.875rem' }}>
              {inStock ? 'check_circle' : 'cancel'}
            </span>
            {inStock
              ? parseInt(selected.available_stock) <= 3
                ? `Only ${selected.available_stock} left!`
                : 'In stock'
              : 'Out of stock for this variant'}
          </p>
        </div>
      )}

      {/* ── CTA Buttons ──────────────────────────── */}
        <div style={{ padding: '1.25rem 0', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <button
          onClick={addToCart}
          disabled={adding || !inStock || !selected}
          className="btn-primary"
          style={{
            width: '100%', padding: '1rem',
            fontSize: '0.9375rem', borderRadius: '0.5rem',
            opacity: (adding || !inStock || !selected) ? 0.7 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
          }}
        >
          <span className="material-symbols-rounded" style={{ fontSize: '1.25rem' }}>
            {inStock ? 'shopping_bag' : 'remove_shopping_cart'}
          </span>
          {adding ? 'Adding…' : inStock ? 'Add to Bag' : 'Out of Stock'}
        </button>

        <Link href="/shop">
          <button className="btn-ghost" style={{ width: '100%', padding: '0.875rem' }}>
            Continue Shopping
          </button>
        </Link>
      </div>

      {/* ── Instagram link ───────────────────────── */}
      {product.instagram_post_url && (
        <div style={{ padding: '0 1.25rem 1.5rem' }}>
          <a
            href={product.instagram_post_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              color: 'var(--on-surface-variant)',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: '0.8125rem', textDecoration: 'none',
            }}
          >
            <span className="material-symbols-rounded" style={{ fontSize: '1rem' }}>photo_camera</span>
            View on Instagram
          </a>
        </div>
      )}
    </div>
  );
}
