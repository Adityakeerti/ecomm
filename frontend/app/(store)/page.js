'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, v1 } from '@/lib/api';
import ProductCard from '@/components/ProductCard';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function HomePage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterMessage, setNewsletterMessage] = useState('');

  useEffect(() => {
    Promise.all([v1.get('/products'), api.get('/categories')])
      .then(([productsRes, categoriesRes]) => {
        setProducts(productsRes.data?.data ?? productsRes.data ?? []);
        setCategories(categoriesRes.data?.data ?? categoriesRes.data ?? []);
      })
      .catch(() => setError('Could not load products. Make sure the backend is running.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page-shell">
      <section className="section-space" style={{ border: '1px solid var(--on-surface)', background: 'var(--surface-low)', padding: '2.5rem 1.5rem' }}>
        <p className="label-caps" style={{ color: 'var(--primary)', marginBottom: '1rem' }}>New Collection</p>
        <h1 className="heading-serif" style={{ fontSize: 'clamp(2.1rem, 8vw, 4rem)', maxWidth: '16ch', lineHeight: 1.05, marginBottom: '1rem' }}>
          Structure and fluidity for everyday luxury.
        </h1>
        <p style={{ maxWidth: '48ch', color: 'var(--on-surface-variant)', marginBottom: '1.5rem' }}>
          Discover editorial silhouettes, grid-locked essentials, and high-contrast details.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Link href="/shop"><button className="btn-primary" style={{ padding: '0.8rem 1.6rem' }}>Explore Now</button></Link>
          <Link href="/track"><button className="btn-secondary" style={{ padding: '0.8rem 1.6rem' }}>Track Order</button></Link>
        </div>
      </section>

      <section className="section-space">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.75rem' }}>
          <h2 className="heading-serif" style={{ fontSize: '1.8rem' }}>Categories</h2>
          <Link href="/shop" className="btn-ghost" style={{ fontSize: '0.8rem' }}>View all</Link>
        </div>
        <div className="no-scrollbar" style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.75rem' }}>
          {categories.map(cat => (
            <Link key={cat.id ?? cat.slug ?? cat.name} href={`/shop?category=${cat.name}`} style={{ textDecoration: 'none', flexShrink: 0 }}>
              <span className="chip chip-inactive">{cat.name}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="section-space">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.25rem' }}>
          <h2 className="heading-serif" style={{ fontSize: '1.8rem' }}>Trending Now</h2>
          <Link href="/shop" className="btn-ghost" style={{ fontSize: '0.8125rem' }}>View all</Link>
        </div>

        {loading && <LoadingSpinner />}
        {error && (
          <div style={{ background: 'var(--error-container)', color: 'var(--error)', padding: '1rem', border: '1px solid var(--error)', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}
        {!loading && !error && products.length === 0 && (
          <p className="body-md" style={{ color: 'var(--outline)', textAlign: 'center', padding: '2rem 0' }}>
            No products yet. Add some from the admin panel.
          </p>
        )}
        {!loading && products.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: '1rem' }}>
            {products.slice(0, 6).map(p => (
              <ProductCard key={p.slug ?? p.id} product={p} />
            ))}
          </div>
        )}
      </section>

      <section className="section-space" style={{ border: '1px solid var(--on-surface)', padding: '1.5rem' }}>
        <h2 className="heading-serif" style={{ fontSize: '1.6rem', marginBottom: '0.375rem' }}>Inner Circle</h2>
        <p style={{ color: 'var(--on-surface-variant)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>Early access to drops, archive sales, and curated inspiration.</p>
        <form
          onSubmit={e => {
            e.preventDefault();
            setNewsletterMessage(`Thanks! We'll reach out at ${newsletterEmail}.`);
            setNewsletterEmail('');
          }}
          style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}
        >
          <input
            type="email"
            placeholder="your@email.com"
            required
            className="input-field"
            value={newsletterEmail}
            onChange={(e) => setNewsletterEmail(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn-primary" style={{ padding: '0.75rem 1.25rem', whiteSpace: 'nowrap', flexShrink: 0 }}>
            Join
          </button>
        </form>
        {newsletterMessage && (
          <p className="body-md" style={{ color: '#065F46', fontSize: '0.8125rem', marginTop: '0.625rem' }}>
            {newsletterMessage}
          </p>
        )}
      </section>

      <footer style={{ borderTop: '1px solid var(--on-surface)', paddingTop: '2rem', paddingBottom: '5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '1.5rem' }}>
          <div>
            <p className="label-caps" style={{ color: 'var(--on-surface)', marginBottom: '0.75rem' }}>Shop</p>
            {['New Arrivals', 'Best Sellers', 'The Essentials'].map(l => (
              <Link key={l} href="/shop" style={{ display: 'block', color: 'var(--on-surface-variant)', textDecoration: 'none', fontSize: '0.875rem', marginBottom: '0.4rem' }}>{l}</Link>
            ))}
          </div>
          <div>
            <p className="label-caps" style={{ color: 'var(--on-surface)', marginBottom: '0.75rem' }}>Support</p>
            {[['Track Order', '/track'], ['Returns', '/returns']].map(([l, href]) => (
              <Link key={l} href={href} style={{ display: 'block', color: 'var(--on-surface-variant)', textDecoration: 'none', fontSize: '0.875rem', marginBottom: '0.4rem' }}>{l}</Link>
            ))}
          </div>
        </div>
        <p style={{ fontSize: '0.75rem', borderTop: '1px solid var(--outline-variant)', paddingTop: '1.25rem', color: 'var(--on-surface-variant)' }}>
          © 2024 Curator Collective. All Rights Reserved.
        </p>
      </footer>
    </div>
  );
}
