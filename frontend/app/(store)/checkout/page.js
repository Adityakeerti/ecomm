'use client';
/**
 * Checkout page — /checkout
 *
 * GPS: Uses browser's native navigator.geolocation (no Google dependency).
 *      ORS API key is used only by the backend for routing.
 *
 * PHONEPE DEV MODE: After POST /payments/initiate succeeds,
 * we redirect directly to /order/[orderNumber] instead of the real PhonePe URL.
 * See helper.md → "PhonePe Integration Checklist" for what to change in production.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cartApi, getUserInfo, getUserToken, paymentsApi, setUserInfo, userApi } from '@/lib/api';
import { getToken, clearToken } from '@/lib/cart';
import { formatPrice } from '@/lib/format';
import LoadingSpinner from '@/components/LoadingSpinner';

const COD_CHARGE_PAISE = 1000;
const ENABLE_DEV_CHECKOUT = process.env.NEXT_PUBLIC_ENABLE_DEV_CHECKOUT === 'true';

const EMPTY_FORM = {
  full_name: '',
  phone: '',
  email: '',
  addr1: '',   // Flat / House No., Building
  addr2: '',   // Street, Road, Colony
  landmark: '', // Landmark
  city: '',    // City / Town (optional)
  pincode: '',
  label: '',   // Home / Work / Custom
  notes: '',
};

/** Join address sub-fields into a single address_line string for the backend */
function buildAddressLine(form) {
  return [form.addr1, form.addr2, form.city].map(s => s.trim()).filter(Boolean).join(', ');
}

export default function CheckoutPage() {
  const router = useRouter();

  const [form, setForm]         = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [apiError, setApiError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('ONLINE');
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [saveAddress, setSaveAddress] = useState(false);
  const [addressMode, setAddressMode] = useState('saved'); // 'saved' | 'live'

  // Cart summary state
  const [cartSummary, setCartSummary] = useState(null);
  const [cartLoading, setCartLoading] = useState(true);
  const [token, setToken] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  // Geolocation state (browser-native, no Google)
  const [geo, setGeo] = useState({ lat: null, lng: null, status: 'idle' });
  // 'idle' | 'detecting' | 'found' | 'denied' | 'unavailable'

  useEffect(() => {
    setToken(getToken());
    setHydrated(true);
    const cached = getUserInfo();
    if (cached?.saved_addresses) setSavedAddresses(cached.saved_addresses);
  }, []);

  const fetchUserData = () => {
    const userToken = getUserToken();
    if (!userToken) {
      setSavedAddresses([]);
      return;
    }
    userApi.get('/me')
      .then((res) => {
        const me = res.data?.data;
        if (!me) return;
        setSavedAddresses(Array.isArray(me.saved_addresses) ? me.saved_addresses : []);
        setUserInfo(me);
        setForm((prev) => ({
          ...prev,
          full_name: prev.full_name || me.full_name || '',
          phone: prev.phone || String(me.phone || '').replace(/^\+91/, ''),
          email: prev.email || me.email || '',
        }));
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchUserData();
    const handleAuthChange = () => fetchUserData();
    window.addEventListener('user-auth-changed', handleAuthChange);
    return () => window.removeEventListener('user-auth-changed', handleAuthChange);
  }, []);

  // ── Fetch cart summary ─────────────────────────────────────────
  useEffect(() => {
    if (!hydrated) return;
    if (!token) { setCartLoading(false); return; }
    cartApi.get(`/${token}`)
      .then(res => setCartSummary(res.data?.data ?? res.data))
      .catch(() => {})
      .finally(() => setCartLoading(false));
  }, [token, hydrated]);

  const detectLocation = () => {
    if (!navigator.geolocation) {
      setGeo(g => ({ ...g, status: 'unavailable' }));
      return;
    }
    setGeo(g => ({ ...g, status: 'detecting' }));
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setGeo({ lat, lng, status: 'found' });
        try {
          const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
          const data = await response.json();
          // Extract pincode from structured address fields (most reliable)
          const pincode = data?.address?.postcode?.replace(/\D/g, '').slice(0, 6) || '';
          // Build a clean address line from structured parts, fallback to display_name
          const addr = data?.address;
          const liveAddr1 = [addr?.house_number, addr?.building].filter(Boolean).join(', ');
          const liveAddr2 = [addr?.road || addr?.pedestrian || addr?.footway].filter(Boolean).join(', ');
          const liveLandmark = [addr?.neighbourhood || addr?.suburb].filter(Boolean).join(', ');
          const liveCity  = addr?.city || addr?.town || addr?.village || addr?.county || '';
          setForm((prev) => ({
            ...prev,
            addr1: prev.addr1?.trim() ? prev.addr1 : liveAddr1,
            addr2: prev.addr2?.trim() ? prev.addr2 : liveAddr2,
            landmark: prev.landmark?.trim() ? prev.landmark : liveLandmark,
            city:  prev.city?.trim()  ? prev.city  : liveCity,
            pincode: prev.pincode?.trim() ? prev.pincode : pincode,
          }));
        } catch {
          // Reverse lookup best-effort only
        }
      },
      () => setGeo(g => ({ ...g, status: 'denied' })),
      { timeout: 8000 }
    );
  };

  const applySavedAddress = (idx) => {
    const a = savedAddresses[idx];
    if (!a) return;
    // Parse saved address back into form fields
    const parts = (a.address_line || '').split(',').map(s => s.trim());
    setForm((prev) => ({
      ...prev,
      full_name: a.full_name || prev.full_name,
      phone: String(a.phone || '').replace(/^\+91/, '') || prev.phone,
      email: a.email || prev.email,
      addr1: parts[0] || '',
      addr2: parts[1] || '',
      landmark: a.landmark || '',
      city: parts[2] || '',
      pincode: a.pincode || prev.pincode,
      label: a.label || '',
    }));
    if (a.lat != null && a.lng != null) {
      setGeo({ lat: Number(a.lat), lng: Number(a.lng), status: 'found' });
    }
  };

  // ── Form helpers ────────────────────────────────────────────────
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
    setFieldErrors(fe => ({ ...fe, [name]: null }));
  };

  const validate = () => {
    const errs = {};
    if (!form.full_name.trim() || form.full_name.trim().length < 2) errs.full_name = 'Full name required (min 2 chars)';
    if (!/^\d{10}$/.test(form.phone.trim())) errs.phone = 'Enter a valid 10-digit mobile number';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.email = 'Enter a valid email address';
    if (!form.addr1.trim()) errs.address_line = 'Address Line 1 is required';
    if (geo.lat == null || geo.lng == null) errs.geo = 'Please pin your live location before placing the order';
    return errs;
  };

  // ── Submit ──────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError(null);

    const errs = validate();
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }

    const payload = {
      cart_token: token,
      full_name:  form.full_name.trim(),
      phone:      form.phone.trim(),
      email:      form.email.trim(),
      address_line: buildAddressLine(form),
      landmark:   form.landmark.trim() || undefined,
      pincode:    form.pincode.trim() || undefined,
      lat:        geo.lat,
      lng:        geo.lng,
      notes:      form.notes.trim() || undefined,
      payment_method: paymentMethod,
      save_address: saveAddress,
      address_label: form.label.trim() || undefined,
    };

    setSubmitting(true);

    try {
      const res = await paymentsApi.post('/initiate', payload);
      const data = res.data?.data ?? res.data;

      // Store order info before redirect
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('pending_order', data.order_number);
      }

      // Clear cart token (order is now committed)
      clearToken();
      window.dispatchEvent(new Event('cart-updated'));

      /**
       * ── DEV MODE (PhonePe not configured) ──────────────────────
       * We skip the real payment_url redirect and go straight to the
       * confirmation page to simulate a successful payment.
       *
       * PRODUCTION: Replace the line below with:
       *   window.location.href = data.payment_url;
       * See helper.md → "PhonePe Integration Checklist"
       * ────────────────────────────────────────────────────────────
       */
      router.push(`/order/${data.order_number}`);

    } catch (err) {
      const errData = err.response?.data;
      if (err.response?.status === 422 && Array.isArray(errData?.data)) {
        // Map backend field errors to our state
        const mapped = {};
        errData.data.forEach(e => { mapped[e.field] = e.message; });
        setFieldErrors(mapped);
      } else {
        setApiError(errData?.message ?? 'Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDevSubmit = async () => {
    if (!token) return;
    setApiError(null);
    setSubmitting(true);
    try {
      const payload = {
        cart_token: token,
        full_name: form.full_name.trim() || 'Dev User',
        phone: form.phone.trim() || '9999999999',
        email: form.email.trim() || 'dev@curator.local',
        address_line: buildAddressLine(form) || 'Dev Address, Test Lane',
        landmark: form.landmark.trim() || 'Dev Landmark',
        pincode: form.pincode.trim() || '000000',
        lat: geo.lat,
        lng: geo.lng,
        notes: form.notes.trim() || 'Dev quick checkout',
        save_address: saveAddress,
        address_label: form.label.trim() || undefined,
      };
      const res = await paymentsApi.post('/dev-initiate', payload);
      const data = res.data?.data ?? res.data;
      clearToken();
      window.dispatchEvent(new Event('cart-updated'));
      router.push(`/order/${data.order_number}`);
    } catch (err) {
      const errData = err.response?.data;
      setApiError(errData?.message ?? 'Dev quick order failed.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────
  const subtotalPaise = cartSummary?.cart_total_paise ?? 0;
  const codChargePaise = paymentMethod === 'COD' ? COD_CHARGE_PAISE : 0;
  const payableTotalPaise = subtotalPaise + codChargePaise;

  if (!hydrated || cartLoading) {
    return <LoadingSpinner />;
  }

  if (!token) {
    return (
      <div style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
        <p style={{ color: 'var(--outline)' }}>Your cart is empty. <a href="/shop" style={{ color: 'var(--primary)' }}>Shop now</a></p>
      </div>
    );
  }

  return (
    <div className="page-shell" style={{ paddingBottom: '7rem' }}>
      <h1 className="heading-serif" style={{ fontSize: '2rem', marginBottom: '0.375rem' }}>
        Review & Checkout
      </h1>
      <p className="body-md" style={{ color: 'var(--on-surface-variant)', fontSize: '0.9rem', marginBottom: '2rem' }}>
        Complete your selection from our seasonal collection.
      </p>

      <form onSubmit={handleSubmit} noValidate>
        {/* ── Shipping Information ── */}
        <section style={{ marginBottom: '1.5rem' }}>
          <h2 className="label-caps" style={{ marginBottom: '1rem' }}>
            Shipping Information
          </h2>

          {/* ── Address source toggle ── */}
          <div style={{ display: 'flex', gap: 0, marginBottom: '1.25rem', border: '1px solid var(--outline-variant)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => setAddressMode('saved')}
              style={{
                flex: 1, padding: '0.6rem 0.75rem', fontSize: '0.8rem', fontWeight: 600,
                fontFamily: 'Inter, sans-serif', border: 'none', cursor: 'pointer',
                background: addressMode === 'saved' ? 'var(--primary)' : 'transparent',
                color: addressMode === 'saved' ? '#fff' : 'var(--on-surface-variant)',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              📋 Saved Address
            </button>
            <button
              type="button"
              onClick={() => setAddressMode('live')}
              style={{
                flex: 1, padding: '0.6rem 0.75rem', fontSize: '0.8rem', fontWeight: 600,
                fontFamily: 'Inter, sans-serif', border: 'none', cursor: 'pointer',
                borderLeft: '1px solid var(--outline-variant)',
                background: addressMode === 'live' ? 'var(--primary)' : 'transparent',
                color: addressMode === 'live' ? '#fff' : 'var(--on-surface-variant)',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              📍 Live Location
            </button>
          </div>

          {/* ── Saved address picker ── */}
          {addressMode === 'saved' && (
            savedAddresses.length > 0 ? (
              <Field label="Choose Saved Address">
                <select className="input-field" defaultValue="" onChange={(e) => applySavedAddress(Number(e.target.value))}>
                  <option value="" disabled>Select saved address</option>
                  {savedAddresses.map((a, idx) => (
                    <option key={`${idx}-${a.pincode || ''}`} value={idx}>
                      {(a.label || 'Saved')} — {a.address_line}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <p style={{ fontSize: '0.8125rem', color: 'var(--outline)', marginBottom: '1rem', padding: '0.75rem', background: 'var(--surface-low)', borderRadius: 'var(--radius-sm)' }}>
                No saved addresses yet. <a href="/account" style={{ color: 'var(--primary)' }}>Add one in your account</a> or use live location.
              </p>
            )
          )}

          {/* ── Live location picker ── */}
          {addressMode === 'live' && (
            <div style={{ marginBottom: '1rem', padding: '1rem', background: 'var(--surface-low)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--outline-variant)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <span className="material-symbols-rounded" style={{ fontSize: '1.25rem', color: 'var(--primary)' }}>my_location</span>
                <p style={{ fontWeight: 600, fontSize: '0.875rem' }}>Pin Your Location</p>
              </div>
              {geo.status === 'found' && (
                <p style={{ fontSize: '0.8125rem', color: '#065F46', marginBottom: '0.75rem', padding: '0.5rem', background: '#D1FAE5', borderRadius: 'var(--radius-sm)' }}>
                  ✓ Location captured ({geo.lat?.toFixed(4)}, {geo.lng?.toFixed(4)})
                </p>
              )}
              {geo.status === 'detecting' && (
                <p style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)', marginBottom: '0.75rem' }}>📍 Detecting your location…</p>
              )}
              {(geo.status === 'denied' || geo.status === 'unavailable') && (
                <p style={{ fontSize: '0.8125rem', color: 'var(--error)', marginBottom: '0.75rem', padding: '0.5rem', background: 'var(--error-container)', borderRadius: 'var(--radius-sm)' }}>
                  {geo.status === 'denied' ? '⚠️ Location access denied. Please enable location in your browser.' : '⚠️ Geolocation not supported.'}
                </p>
              )}
              <button type="button" onClick={detectLocation} className="btn-primary" style={{ width: '100%', padding: '0.75rem', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                  <span className="material-symbols-rounded" style={{ fontSize: '1.1rem' }}>gps_fixed</span>
                  {geo.status === 'found' ? 'Update Location' : 'Use My Current Location'}
                </span>
              </button>
              <p style={{ color: 'var(--outline)', fontSize: '0.75rem', textAlign: 'center' }}>This helps us deliver to your exact location</p>
            </div>
          )}

          <Field label="Full Name" error={fieldErrors.full_name}>
            <input name="full_name" value={form.full_name} onChange={handleChange} placeholder="Alex Kumar" className="input-field" autoComplete="name" />
          </Field>
          <Field label="Mobile Number" hint="10-digit number" error={fieldErrors.phone}>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', fontWeight: 600, color: 'var(--on-surface-variant)', fontSize: '0.9375rem' }}>+91</span>
              <input name="phone" value={form.phone} onChange={handleChange} placeholder="9876543210" className="input-field" style={{ paddingLeft: '2.75rem' }} inputMode="numeric" maxLength={10} />
            </div>
          </Field>
          <Field label="Email Address" error={fieldErrors.email}>
            <input name="email" value={form.email} onChange={handleChange} placeholder="alex@email.com" className="input-field" type="email" autoComplete="email" />
          </Field>
          <Field label="Address Line 1" hint="Flat / House No., Building" error={fieldErrors.address_line}>
            <input name="addr1" value={form.addr1} onChange={handleChange} placeholder="Flat 4B, Sunrise Apartments" className="input-field" autoComplete="address-line1" />
          </Field>
          <Field label="Address Line 2" hint="Street, Road, Colony">
            <input name="addr2" value={form.addr2} onChange={handleChange} placeholder="12 MG Road, Civil Lines" className="input-field" autoComplete="address-line2" />
          </Field>
          <Field label="Landmark" hint="Nearby landmark for easy navigation">
            <input name="landmark" value={form.landmark} onChange={handleChange} placeholder="Near City Mall, Opposite Park" className="input-field" />
          </Field>
          <Field label="City / Town (Optional)">
            <input name="city" value={form.city} onChange={handleChange} placeholder="Agra" className="input-field" autoComplete="address-level2" />
          </Field>
          <Field label="Pincode (Optional)">
            <input name="pincode" value={form.pincode} onChange={handleChange} placeholder="282001" className="input-field" inputMode="numeric" maxLength={6} />
          </Field>

          {fieldErrors.geo && (
            <p style={{ color: 'var(--error)', fontSize: '0.8125rem', marginBottom: '0.5rem' }}>{fieldErrors.geo}</p>
          )}

          <div style={{ marginBottom: '1rem', borderTop: '1px solid var(--outline-variant)', paddingTop: '0.8rem' }}>
            <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
              <input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} />
              Save this address for future orders
            </label>
            {saveAddress && (
              <div>
                <p className="label-caps" style={{ marginBottom: '0.5rem', fontSize: '0.72rem' }}>Label this address as</p>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {['Home', 'Work'].map(lbl => (
                    <button
                      key={lbl}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, label: lbl }))}
                      style={{
                        padding: '0.5rem 1rem',
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        border: '1px solid var(--outline-variant)',
                        borderRadius: 'var(--radius-sm)',
                        background: form.label === lbl ? 'var(--primary)' : 'transparent',
                        color: form.label === lbl ? '#fff' : 'var(--on-surface)',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      {lbl}
                    </button>
                  ))}
                  <input
                    type="text"
                    placeholder="Custom"
                    value={!['Home', 'Work'].includes(form.label) ? form.label : ''}
                    onChange={(e) => setForm(f => ({ ...f, label: e.target.value }))}
                    onFocus={() => { if (['Home', 'Work'].includes(form.label)) setForm(f => ({ ...f, label: '' })); }}
                    style={{
                      padding: '0.5rem 1rem',
                      fontSize: '0.8125rem',
                      border: '1px solid var(--outline-variant)',
                      borderRadius: 'var(--radius-sm)',
                      background: !['Home', 'Work'].includes(form.label) && form.label ? 'var(--primary)' : 'transparent',
                      color: !['Home', 'Work'].includes(form.label) && form.label ? '#fff' : 'var(--on-surface)',
                      minWidth: '100px',
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          <Field label="Order Notes (Optional)">
            <textarea name="notes" value={form.notes} onChange={handleChange} placeholder="Leave at door, gate code, etc." className="input-field" rows={2} style={{ resize: 'vertical' }} />
          </Field>
        </section>

        {/* ── Cart Summary ── */}
        <section className="section-card" style={{ marginBottom: '1.5rem' }}>
          <h2 className="label-caps" style={{ marginBottom: '0.875rem' }}>
            Cart Summary
          </h2>
          {cartSummary?.items?.map(item => (
            <div key={item.variant_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.625rem' }}>
              <div>
                <p style={{ fontWeight: 600, fontSize: '0.875rem' }}>{item.product_name}</p>
                <p style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)' }}>
                  {[item.colour, item.size].filter(Boolean).join(' / ')} × {item.qty}
                </p>
              </div>
              <p style={{ fontWeight: 700, fontSize: '0.9rem', flexShrink: 0 }}>
                {formatPrice(item.price_paise * item.qty)}
              </p>
            </div>
          ))}
          {!cartLoading && cartSummary && (
            <>
              <div style={{ borderTop: '1px solid var(--surface-high)', marginTop: '0.75rem', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600 }}>Subtotal</span>
                <span style={{ fontWeight: 700 }}>{formatPrice(subtotalPaise)}</span>
              </div>
              {paymentMethod === 'COD' && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                  <span style={{ fontWeight: 600 }}>COD Charge</span>
                  <span style={{ fontWeight: 700 }}>{formatPrice(codChargePaise)}</span>
                </div>
              )}
              <div style={{ borderTop: '1px solid var(--surface-high)', marginTop: '0.75rem', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700 }}>Total</span>
                <span style={{ fontWeight: 800, fontSize: '1.125rem' }}>{formatPrice(payableTotalPaise)}</span>
              </div>
            </>
          )}
        </section>

        <section className="section-card" style={{ marginBottom: '1.5rem' }}>
          <h2 className="label-caps" style={{ marginBottom: '0.875rem' }}>
            Payment Method
          </h2>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              type="button"
              className={`payment-tile${paymentMethod === 'ONLINE' ? ' selected' : ''}`}
              onClick={() => setPaymentMethod('ONLINE')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <span className="material-symbols-rounded" style={{ fontSize: '1.1rem', color: paymentMethod === 'ONLINE' ? 'var(--primary)' : 'var(--outline)' }}>payment</span>
                <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>Pay Online</span>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)' }}>PhonePe / UPI / Card</p>
            </button>
            <button
              type="button"
              className={`payment-tile${paymentMethod === 'COD' ? ' selected' : ''}`}
              onClick={() => setPaymentMethod('COD')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <span className="material-symbols-rounded" style={{ fontSize: '1.1rem', color: paymentMethod === 'COD' ? 'var(--primary)' : 'var(--outline)' }}>local_atm</span>
                <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>Cash on Delivery</span>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)' }}>+₹10 handling charge</p>
            </button>
          </div>
        </section>

        {/* SSL badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', padding: '0.75rem', background: 'var(--surface-low)', borderRadius: 'var(--radius-sm)' }}>
          <span className="material-symbols-rounded" style={{ fontSize: '1.125rem', color: '#065F46' }}>lock</span>
          <p style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)' }}>
            SSL Secure. Your transaction is encrypted with 256-bit security.
          </p>
        </div>

        {apiError && (
          <div style={{ background: 'var(--error-container)', color: 'var(--error)', padding: '0.875rem', borderRadius: 'var(--radius-sm)', fontSize: '0.875rem', marginBottom: '1rem' }}>
            {apiError}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="btn-primary"
          style={{ width: '100%', padding: '1rem', fontSize: '0.9375rem' }}
        >
          {submitting ? 'Placing Order…' : (paymentMethod === 'COD' ? 'Place COD Order →' : 'Pay with PhonePe →')}
        </button>
        <p style={{ fontSize: '0.75rem', color: 'var(--outline)', textAlign: 'center', marginTop: '0.75rem' }}>
          {paymentMethod === 'COD'
            ? 'COD includes ₹10 handling charge.'
            : (ENABLE_DEV_CHECKOUT ? '(Dev mode: skips PhonePe redirect)' : 'You will be redirected to PhonePe to complete payment.')}
        </p>
        {ENABLE_DEV_CHECKOUT && (
          <button
            type="button"
            onClick={handleDevSubmit}
            disabled={submitting}
            className="btn-secondary"
            style={{ width: '100%', padding: '0.875rem', marginTop: '0.75rem' }}
          >
            {submitting ? 'Creating dev order…' : 'Dev Quick Order (Bypass)'}
          </button>
        )}
      </form>
    </div>
  );
}

/** Reusable field wrapper */
function Field({ label, hint, error, children }) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <label className="label-caps" style={{
        display: 'block',
        marginBottom: '0.35rem',
        fontSize: '0.72rem',
      }}>
        {label} {hint && <span style={{ fontWeight: 400, color: 'var(--outline)', textTransform: 'none', letterSpacing: 0 }}>— {hint}</span>}
      </label>
      {children}
      {error && <p style={{ color: 'var(--error)', fontSize: '0.75rem', marginTop: '0.25rem' }}>{error}</p>}
    </div>
  );
}
