'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { v1 } from '@/lib/api';
import ProductCard from '@/components/ProductCard';
import LoadingSpinner from '@/components/LoadingSpinner';
import { Suspense } from 'react';

function ShopContent() {
  const searchParams = useSearchParams();
  const initialCat = searchParams.get('category') || 'All';

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [active, setActive]     = useState(initialCat);

  useEffect(() => {
    // Load categories from DB once
    import('@/lib/api').then(({ api }) =>
      api.get('/categories')
        .then(res => setCategories(res.data?.data ?? res.data ?? []))
        .catch(() => {})
    );
  }, []);

  const fetchProducts = (cat) => {
    setLoading(true);
    setError(null);
    const params = cat && cat !== 'All' ? { category: cat } : {};
    v1.get('/products', { params })
      .then(res => setProducts(res.data?.data ?? res.data ?? []))
      .catch(() => setError('Could not load products.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchProducts(active); }, [active]);

  return (
    <div className="page-shell">
      <h1 className="heading-serif" style={{ fontSize: '2rem', marginBottom: '1rem' }}>Product Catalog</h1>

      {/* Filter chips */}
      <div className="no-scrollbar" style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', marginBottom: '1.75rem' }}>
        <button
          onClick={() => setActive('All')}
          className={`chip ${active === 'All' ? 'chip-active' : 'chip-inactive'}`}
          style={{ flexShrink: 0 }}
        >
          All
        </button>
        {categories.map(cat => (
          <button
            key={cat.id ?? cat.slug}
            onClick={() => setActive(cat.name)}
            className={`chip ${active === cat.name ? 'chip-active' : 'chip-inactive'}`}
            style={{ flexShrink: 0 }}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Product count */}
      {!loading && !error && (
        <p className="label-caps" style={{ marginBottom: '1rem' }}>
          {products.length} {products.length === 1 ? 'piece' : 'pieces'}
        </p>
      )}

      {loading && <LoadingSpinner />}
      {error && (
        <div style={{ background: 'var(--error-container)', color: 'var(--error)', padding: '1rem', border: '1px solid var(--error)', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}
      {!loading && !error && products.length === 0 && (
        <p className="body-md" style={{ color: 'var(--outline)', textAlign: 'center', padding: '3rem 0' }}>
          No products in this category yet.
        </p>
      )}

      {/* Grid */}
      {!loading && products.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
          {products.map(p => (
            <ProductCard key={p.slug ?? p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ShopPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem' }}><LoadingSpinner /></div>}>
      <ShopContent />
    </Suspense>
  );
}
