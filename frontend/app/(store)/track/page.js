'use client';
import { useEffect, useState } from 'react';
import { trackApi, getUserToken } from '@/lib/api';
import { formatPrice, formatPhone } from '@/lib/format';
import LoadingSpinner from '@/components/LoadingSpinner';

const STATUS_ORDER = ['PENDING', 'PROCESSING', 'DISPATCHED', 'DELIVERED'];
const STATUS_MAP = {
  PENDING: 'Order Placed',
  PROCESSING: 'Processing',
  DISPATCHED: 'In Transit',
  DELIVERED: 'Delivered'
};
const STATUS_DESC = {
  PENDING: 'Your order has been securely received and is awaiting review by our atelier team.',
  PROCESSING: 'Items are being carefully gathered, inspected for quality, and prepared for dispatch.',
  DISPATCHED: 'Your package has left our facility and is en route via express courier.',
  DELIVERED: 'Awaiting final delivery to your specified address.'
};

export default function TrackPage() {
  const [step, setStep]           = useState(1); // 1=phone input, 2=orders list, 3=order detail
  const [phone, setPhone]         = useState('');
  const [orders, setOrders]       = useState([]);
  const [selectedOrderNum, setSelectedOrderNum] = useState(null);
  const [orderDetail, setOrderDetail] = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const token = getUserToken();
    if (!token) return;
    setIsLoggedIn(true);
    setLoading(true);
    trackApi.get('/my-orders/list', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        const data = res.data?.data ?? res.data;
        setOrders(data.orders ?? []);
        setStep(2);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleLookup = async (e) => {
    e.preventDefault();
    if (!/^\d{10}$/.test(phone.trim())) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await trackApi.post('/lookup', { phone: formatPhone(phone.trim()) });
      const data = res.data?.data ?? res.data;
      setOrders(data.orders ?? []);
      setStep(2);
    } catch {
      setError('Could not fetch orders. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOrder = async (orderNumber) => {
    setSelectedOrderNum(orderNumber);
    setError(null);
    setLoading(true);
    const token = getUserToken();
    const last4 = `${formatPhone(phone.trim())}`.slice(-4);
    try {
      const res = token
        ? await trackApi.get(`/my-orders/${orderNumber}`, { headers: { Authorization: `Bearer ${token}` } })
        : await trackApi.get(`/${orderNumber}`, { params: { phone: last4 } });
      setOrderDetail(res.data?.data ?? res.data);
      setStep(3);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Could not load order details.');
      setStep(2);
    } finally {
      setLoading(false);
    }
  };

  const renderTimelineStep = (statusKey, stepIndex, currentStatusIndex, details) => {
    const isCompleted = stepIndex <= currentStatusIndex;
    const isActive = stepIndex === currentStatusIndex;
    const title = STATUS_MAP[statusKey];
    let desc = STATUS_DESC[statusKey];

    if (statusKey === 'DELIVERED' && isCompleted) {
      desc = 'Your package has been successfully delivered.';
    }

    const isDimmed = !isCompleted;

    return (
      <div key={statusKey} style={{ position: 'relative', marginBottom: '2rem', display: 'flex', gap: '1.5rem', opacity: isDimmed ? 0.5 : 1 }}>
        {/* Node */}
        {isActive && statusKey === 'DISPATCHED' ? (
          <div style={{ position: 'absolute', left: '-2.5rem', marginTop: '0.375rem', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '2rem', height: '2rem', borderRadius: '50%', zIndex: 10, backgroundColor: 'var(--primary)', boxShadow: '0 0 0 4px rgba(46,91,255,0.2)' }}>
            <span className="material-symbols-rounded" style={{ color: '#fff', fontSize: '1.25rem', fontVariationSettings: "'FILL' 1" }}>local_shipping</span>
          </div>
        ) : isCompleted ? (
          <div style={{ position: 'absolute', left: '-2.5rem', marginTop: '0.375rem', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '2rem', height: '2rem', borderRadius: '50%', zIndex: 10, backgroundColor: 'var(--surface-white)', border: '2px solid var(--primary)' }}>
            <div style={{ width: '0.75rem', height: '0.75rem', borderRadius: '50%', backgroundColor: 'var(--primary)' }}></div>
          </div>
        ) : (
          <div style={{ position: 'absolute', left: '-2.5rem', marginTop: '0.375rem', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '2rem', height: '2rem', borderRadius: '50%', zIndex: 10, backgroundColor: 'var(--surface-white)', border: '2px solid var(--outline-variant)' }}>
          </div>
        )}

        <div style={{ flex: 1 }}>
          <span className="label-caps" style={{ display: 'block', marginBottom: '0.25rem', color: isCompleted ? 'var(--primary)' : 'var(--on-surface-variant)' }}>
            {isCompleted ? new Date(details?.updated_at || details?.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : `ESTIMATED`}
          </span>
          <h3 className="heading-serif" style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.5rem' }}>{title}</h3>
          <p style={{ fontSize: '0.9375rem', color: 'var(--on-surface-variant)', lineHeight: 1.5, marginBottom: '1rem' }}>
            {desc}
          </p>

          {/* Special Map Callout for Active Dispatched */}
          {isActive && statusKey === 'DISPATCHED' && (
            <div style={{ border: '1px solid var(--on-surface)', padding: '1rem', display: 'flex', gap: '1rem', alignItems: 'center', backgroundColor: 'var(--surface-white)', cursor: 'pointer' }}>
              <div style={{ width: '6rem', height: '6rem', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', backgroundColor: 'var(--surface-high)', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0, opacity: 0.5, backgroundImage: 'radial-gradient(var(--outline-variant) 1px, transparent 1px)', backgroundSize: '10px 10px' }}></div>
                <span className="material-symbols-rounded" style={{ zIndex: 10, color: 'var(--primary)', fontSize: '2rem', fontVariationSettings: "'FILL' 1" }}>location_on</span>
              </div>
              <div style={{ flexGrow: 1 }}>
                <span className="label-caps" style={{ display: 'block', marginBottom: '0.25rem' }}>Current Status</span>
                <span style={{ fontSize: '0.9375rem', fontWeight: 700, display: 'block', color: 'var(--on-surface)' }}>En Route to Destination</span>
                {details.emp_name && (
                  <span style={{ fontSize: '0.75rem', marginTop: '0.5rem', display: 'inline-block', color: 'var(--on-surface-variant)' }}>Partner: {details.emp_name}</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <main className="page-shell" style={{ maxWidth: '1440px', margin: '0 auto', paddingBottom: '7rem' }}>
      
      {/* ── STEP 1: Phone input ─────────────────────────── */}
      {step === 1 && (
        <section style={{ maxWidth: '42rem', margin: '0 auto', textAlign: 'center', paddingTop: '2rem', paddingBottom: '4rem' }}>
          <h1 className="heading-serif" style={{ textTransform: 'uppercase', fontSize: '3rem', fontWeight: 700, marginBottom: '1rem', letterSpacing: '-0.02em' }}>Track Order</h1>
          <p style={{ fontSize: '1.125rem', color: 'var(--on-surface-variant)', marginBottom: '2rem' }}>
            Enter your unique order identifier to view the current status and detailed journey of your items.
          </p>
          <form onSubmit={handleLookup} style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'relative', width: '100%', maxWidth: '24rem' }}>
              <span style={{ position: 'absolute', left: '0', top: '50%', transform: 'translateY(-50%)', fontWeight: 600, color: 'var(--on-surface)' }}>+91</span>
              <input
                type="text"
                value={phone}
                onChange={e => { setPhone(e.target.value); setError(null); }}
                placeholder="9876543210"
                style={{ width: '100%', backgroundColor: 'transparent', border: 'none', borderBottom: '1px solid var(--on-surface)', outline: 'none', padding: '0.75rem 0 0.75rem 2.5rem', fontSize: '1rem', transition: 'border-color 0.2s' }}
                inputMode="numeric"
                maxLength={10}
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary" style={{ padding: '0.75rem 2.5rem', textTransform: 'uppercase', letterSpacing: '0.1em', flexShrink: 0 }}>
              {loading ? 'Searching…' : 'Track'}
            </button>
          </form>
          {error && <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: 'var(--error)' }}>{error}</p>}
        </section>
      )}

      {/* ── STEP 2: Orders list ─────────────────────────── */}
      {step === 2 && (
        <section style={{ maxWidth: '48rem', margin: '0 auto', paddingBottom: '4rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem', borderBottom: '1px solid var(--on-surface)', paddingBottom: '1rem' }}>
            <h1 className="heading-serif" style={{ textTransform: 'uppercase', fontSize: '2rem', fontWeight: 700, margin: 0 }}>Your Orders</h1>
            {!isLoggedIn && (
              <button onClick={() => setStep(1)} className="btn-ghost" style={{ fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <span className="material-symbols-rounded" style={{ fontSize: '1rem' }}>arrow_back</span> Change Number
              </button>
            )}
          </div>

          {loading && <LoadingSpinner />}
          {!loading && orders.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem 0' }}>
              <span className="material-symbols-rounded" style={{ fontSize: '3rem', color: 'var(--outline)', display: 'block', marginBottom: '1rem' }}>search_off</span>
              <p style={{ color: 'var(--on-surface-variant)' }}>No orders found for this number.</p>
            </div>
          )}
          {error && <p style={{ marginBottom: '1rem', fontSize: '0.875rem', color: 'var(--error)' }}>{error}</p>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {orders.map(ord => (
              <button
                key={ord.order_number}
                onClick={() => handleSelectOrder(ord.order_number)}
                disabled={loading}
                className="card-shadow"
                style={{ width: '100%', textAlign: 'left', backgroundColor: 'var(--surface-white)', padding: '1.5rem', border: '1px solid var(--outline-variant)', cursor: 'pointer', transition: 'transform 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '1rem', color: 'var(--primary)' }}>#{ord.order_number}</span>
                  <span className="label-caps" style={{ padding: '0.25rem 0.5rem', backgroundColor: 'var(--surface-high)', color: 'var(--on-surface)' }}>{ord.status}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <span style={{ fontSize: '0.875rem', color: 'var(--on-surface-variant)' }}>
                    {new Date(ord.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  <span style={{ fontWeight: 700, fontSize: '1.125rem' }}>
                    {formatPrice(ord.total_paise)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── STEP 3: Full order detail (The Grid) ────────── */}
      {step === 3 && orderDetail && !loading && (() => {
        const normalizedStatus = String(orderDetail.status || '').toUpperCase();
        let currentStatusIndex = STATUS_ORDER.indexOf(normalizedStatus);
        if (currentStatusIndex === -1) {
          currentStatusIndex = STATUS_ORDER.length; 
        }

        return (
          <>
            <div style={{ maxWidth: '64rem', margin: '0 auto', marginBottom: '1.5rem' }}>
              <button onClick={() => { setStep(2); setOrderDetail(null); }} className="btn-ghost" style={{ fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <span className="material-symbols-rounded" style={{ fontSize: '1rem' }}>arrow_back</span> Back to Orders
              </button>
            </div>

            <section style={{ maxWidth: '64rem', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
              
              {/* Timeline (Left Column) */}
              <div style={{ flex: '1 1 500px' }}>
                <h2 className="heading-serif" style={{ fontSize: '1.5rem', textTransform: 'uppercase', borderBottom: '1px solid var(--on-surface)', paddingBottom: '0.5rem', marginBottom: '2rem' }}>Order Journey</h2>
                
                <div style={{ position: 'relative', paddingLeft: '2.5rem' }}>
                  {/* Vertical Line Background */}
                  <div style={{ position: 'absolute', left: '1.2rem', top: '1rem', bottom: '1rem', width: '1px', backgroundColor: 'var(--surface-variant)' }}></div>
                  
                  {/* Active Vertical Line */}
                  <div style={{ position: 'absolute', left: '1.2rem', top: '1rem', width: '1px', backgroundColor: 'var(--primary)', transition: 'height 0.5s', height: `${(Math.max(0, currentStatusIndex) / (STATUS_ORDER.length - 1)) * 100}%` }}></div>

                  {STATUS_ORDER.map((statusKey, idx) => renderTimelineStep(statusKey, idx, currentStatusIndex, orderDetail))}
                </div>
              </div>

              {/* Order Details Sidebar (Right Column) */}
              <aside style={{ flex: '1 1 300px' }}>
                <div style={{ border: '1px solid var(--on-surface)', padding: '1.5rem', position: 'sticky', top: '6rem', backgroundColor: 'var(--surface-white)' }}>
                  <h2 className="heading-serif" style={{ fontSize: '1.5rem', textTransform: 'uppercase', borderBottom: '1px solid var(--on-surface)', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>Order Details</h2>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.5rem' }}>
                    <div>
                      <span className="label-caps" style={{ display: 'block', marginBottom: '0.25rem' }}>Order Number</span>
                      <span style={{ fontWeight: 700, fontSize: '1.125rem', color: 'var(--on-surface)' }}>#{orderDetail.order_number}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span className="label-caps" style={{ display: 'block', marginBottom: '0.25rem' }}>Total</span>
                      <span style={{ fontWeight: 700, fontSize: '1.125rem', color: 'var(--on-surface)' }}>{formatPrice(orderDetail.total_paise)}</span>
                    </div>
                  </div>

                  {/* Item List */}
                  <div style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '1rem' }}>
                    {(orderDetail.items ?? []).map((item, i) => (
                      <div key={i} style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--outline-variant)' }}>
                        <div style={{ width: '4rem', height: '5rem', flexShrink: 0, position: 'relative', backgroundColor: 'var(--surface-high)' }}>
                          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.3 }}>
                            <span className="material-symbols-rounded" style={{ fontSize: '1.5rem' }}>checkroom</span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: '100%' }}>
                          <div>
                            <span style={{ fontWeight: 700, fontSize: '0.875rem', display: 'block', marginBottom: '0.25rem', color: 'var(--on-surface)' }}>{item.product_name}</span>
                            <span className="label-caps" style={{ textTransform: 'none', letterSpacing: 'normal' }}>
                              {[item.colour, item.size].filter(Boolean).join(' | ')} | Qty: {item.quantity}
                            </span>
                          </div>
                          <span style={{ fontSize: '0.875rem', fontWeight: 700, marginTop: '0.5rem' }}>{formatPrice(item.subtotal_paise)}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Shipping Address */}
                  <div style={{ marginTop: '1rem' }}>
                    <h4 className="label-caps" style={{ marginBottom: '0.5rem' }}>Shipping Destination</h4>
                    <address style={{ fontStyle: 'normal', fontSize: '0.875rem', color: 'var(--on-surface)', lineHeight: 1.6 }}>
                      {(String(orderDetail.delivery_address || 'Address unavailable').split(', ')).map((line, i) => (
                        <span key={i} style={{ display: 'block' }}>{line}</span>
                      ))}
                    </address>
                  </div>

                </div>
              </aside>

            </section>
          </>
        );
      })()}
      
      {step === 3 && loading && <LoadingSpinner />}
      {step === 3 && error && <p style={{ textAlign: 'center', marginTop: '2rem', fontSize: '0.875rem', color: 'var(--error)' }}>{error}</p>}
      
    </main>
  );
}
