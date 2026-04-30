'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ordersApi } from '@/lib/api';
import { formatPrice } from '@/lib/format';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function OrderConfirmationPage() {
  const { id: orderNumber } = useParams();
  const [order, setOrder]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  useEffect(() => {
    ordersApi.get(`/${orderNumber}/confirmation`)
      .then(res => setOrder(res.data?.data ?? res.data))
      .catch(err => {
        if (err.response?.status === 404) setError('Order not found.');
        else setError('Could not load order details.');
      })
      .finally(() => setLoading(false));
  }, [orderNumber]);

  if (loading) return <LoadingSpinner />;
  if (error) return (
    <div style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
      <p style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", color: 'var(--error)' }}>{error}</p>
      <Link href="/" style={{ display: 'block', marginTop: '1rem', color: 'var(--primary)', fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 600 }}>Back to Home</Link>
    </div>
  );

  return (
    <div className="page-shell" style={{ paddingTop: '2rem' }}>
      {/* Confirmation hero */}
      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <div style={{
          width: '4.5rem', height: '4.5rem', borderRadius: '50%',
          background: '#D1FAE5', display: 'flex', alignItems: 'center',
          justifyContent: 'center', margin: '0 auto 1.25rem',
        }}>
          <span className="material-symbols-rounded" style={{ fontSize: '2.25rem', color: '#065F46' }}>check_circle</span>
        </div>
        <h1 className="heading-serif" style={{ fontSize: '2.2rem', marginBottom: '0.5rem' }}>
          Confirmed.
        </h1>
        <p className="body-md" style={{ color: 'var(--on-surface-variant)', fontSize: '0.9375rem', maxWidth: '280px', margin: '0 auto' }}>
          Thank you, {order.customer_name?.split(' ')[0]}. Your items are being prepared.
        </p>
      </div>

      {/* Order details card */}
      <div style={{ background: 'var(--surface-white)', border: '1px solid var(--on-surface)', padding: '1.5rem', marginBottom: '1.25rem' }}>
        <Row label="Order Number" value={<span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)' }}>#{order.order_number}</span>} />
        <Row label="Status" value={
          <span className="status-badge" style={{ background: '#D1FAE5', color: '#065F46' }}>
            {order.status}
          </span>
        } />
        <Row label="Payment" value={
          <span className="status-badge" style={{ background: '#D1E7FF', color: '#0A4F8F' }}>
            {order.payment_status}
          </span>
        } />
        <Row label="Total" value={<strong>{formatPrice(order.total_paise)}</strong>} />
        <Row label="Zone" value={order.zone_label} />
        <Row label="Est. Delivery" value="2–4 business days" last />
      </div>

      {/* Address */}
      {order.delivery_address && (
        <div style={{ background: 'var(--surface-low)', borderRadius: '0.5rem', padding: '1rem', marginBottom: '1.25rem' }}>
          <p className="label-md" style={{ color: 'var(--on-surface-variant)', marginBottom: '0.375rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Delivery Address</p>
          <p className="body-md" style={{ fontSize: '0.875rem', color: 'var(--on-surface)' }}>{order.delivery_address}</p>
        </div>
      )}

      {/* WhatsApp button */}
      {order.whatsapp_url && (
        <a href={order.whatsapp_url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'block', marginBottom: '0.75rem' }}>
          <button style={{
            width: '100%', padding: '1rem',
            background: '#25D366', color: '#fff',
            border: 'none', borderRadius: '0.5rem',
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontWeight: 700, fontSize: '0.9375rem',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
          }}>
            <span className="material-symbols-rounded" style={{ fontSize: '1.25rem' }}>chat</span>
            Chat on WhatsApp
          </button>
        </a>
      )}

      <Link href="/track">
        <button className="btn-secondary" style={{ width: '100%', padding: '0.875rem', marginBottom: '0.75rem' }}>
          Track This Order
        </button>
      </Link>
      <Link href="/shop">
        <button className="btn-ghost" style={{ width: '100%', padding: '0.875rem' }}>
          Continue Shopping
        </button>
      </Link>
    </div>
  );
}

function Row({ label, value, last }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '0.75rem 0',
      borderBottom: last ? 'none' : '1px solid var(--surface-high)',
    }}>
      <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 500, fontSize: '0.875rem', color: 'var(--on-surface-variant)' }}>{label}</span>
      <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 600, fontSize: '0.875rem' }}>{value}</span>
    </div>
  );
}
