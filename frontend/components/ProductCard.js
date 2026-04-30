'use client';
import Link from 'next/link';
import { formatPrice } from '@/lib/format';

/**
 * ProductCard
 * Props: { product } from v_product_listing view
 * Fields used: slug, name, category, base_price_paise, image_url
 */
export default function ProductCard({ product }) {
  const price = formatPrice(product.price_paise ?? product.base_price_paise);

  return (
    <Link href={`/p/${product.slug}`} style={{ textDecoration: 'none', display: 'block' }}>
      <article
        style={{
          background: 'var(--surface-white)',
          border: '1px solid transparent',
          borderRadius: 0,
          overflow: 'hidden',
          transition: 'transform 0.2s ease, border-color 0.2s ease',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform = 'translateY(-4px)';
          e.currentTarget.style.borderColor = 'var(--on-surface)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.borderColor = 'transparent';
        }}
      >
        {/* Product image */}
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="product-img"
            loading="lazy"
          />
        ) : (
          <div className="product-img" style={{
            background: 'var(--surface-high)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <span className="material-symbols-rounded" style={{ fontSize: '3rem', color: 'var(--outline)' }}>
              checkroom
            </span>
          </div>
        )}

        {/* Info */}
        <div style={{ padding: '0.875rem 1rem 1rem' }}>
          {product.category && (
            <span className="label-caps" style={{ color: 'var(--primary)' }}>
              {product.category}
            </span>
          )}
          <p style={{
            fontFamily: "'Inter', sans-serif",
            fontWeight: 600,
            fontSize: '1rem',
            color: 'var(--on-surface)',
            marginTop: '0.2rem',
            lineHeight: 1.3,
          }}>
            {product.name}
          </p>
          <p style={{
            fontFamily: "'Inter', sans-serif",
            fontWeight: 600,
            fontSize: '0.9rem',
            color: 'var(--on-surface)',
            marginTop: '0.375rem',
          }}>
            {price}
          </p>
        </div>
      </article>
    </Link>
  );
}
