'use client';
import { useEffect, useState } from 'react';
import { clearUserToken, getUserInfo, getUserToken, setUserInfo, setUserToken, userApi } from '@/lib/api';

const EMPTY_LOGIN    = { email: '', password: '' };
const EMPTY_REGISTER = { full_name: '', email: '', password: '' };
const EMPTY_ADDR = { label: '', addr1: '', addr2: '', landmark: '', city: '', pincode: '', phone: '' };

function buildAddressLine(f) {
  return [f.addr1, f.addr2, f.city].map(s => s.trim()).filter(Boolean).join(', ');
}

function getInitials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function AddrField({ label, hint, children }) {
  return (
    <div>
      <label className="label-caps" style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.68rem' }}>
        {label}{hint && <span style={{ fontWeight: 400, color: 'var(--outline)', textTransform: 'none', letterSpacing: 0 }}> — {hint}</span>}
      </label>
      {children}
    </div>
  );
}

export default function AccountPage() {
  const [tab, setTab]               = useState('signin');
  const [loginForm, setLoginForm]   = useState(EMPTY_LOGIN);
  const [regForm, setRegForm]       = useState(EMPTY_REGISTER);
  const [user, setUser]             = useState(null);
  const [loading, setLoading]       = useState(false);
  const [message, setMessage]       = useState(null);
  const [showPw, setShowPw]         = useState(false);
  const [showRegPw, setShowRegPw]   = useState(false);
  const [addrOpen, setAddrOpen]     = useState(false);
  const [addrForm, setAddrForm]     = useState(EMPTY_ADDR);
  const [addrLoading, setAddrLoading] = useState(false);
  const [geo, setGeo]               = useState({ lat: null, lng: null, status: 'idle' });

  useEffect(() => {
    const token = getUserToken();
    if (!token) return;
    const cached = getUserInfo();
    if (cached) setUser(cached);
    userApi.get('/me')
      .then(res => {
        const me = res.data?.data;
        if (me) { setUser(me); setUserInfo(me); }
      })
      .catch(() => { clearUserToken(); setUser(null); });
  }, []);

  const onSignIn = async (e) => {
    e.preventDefault();
    setLoading(true); setMessage(null);
    try {
      const res  = await userApi.post('/login', { email: loginForm.email.trim(), password: loginForm.password });
      const data = res.data || {};
      setUserToken(data.accessToken);
      // Fetch latest profile immediately so saved addresses appear without refresh.
      const meRes = await userApi.get('/me');
      const me = meRes.data?.data || data.user || null;
      setUserInfo(me);
      setUser(me);
      window.dispatchEvent(new Event('user-auth-changed'));
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Sign in failed. Please check your credentials.' });
    } finally {
      setLoading(false);
    }
  };

  const onSignUp = async (e) => {
    e.preventDefault();
    setLoading(true); setMessage(null);
    try {
      const res  = await userApi.post('/register', { full_name: regForm.full_name.trim(), email: regForm.email.trim(), password: regForm.password });
      const data = res.data || {};
      setUserToken(data.accessToken);
      setUserInfo(data.user);
      setUser(data.user || null);
      window.dispatchEvent(new Event('user-auth-changed'));
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Could not create account.' });
    } finally {
      setLoading(false);
    }
  };

  const closeAddrForm = () => { setAddrOpen(null); setAddrForm(EMPTY_ADDR); setGeo({ lat: null, lng: null, status: 'idle' }); };

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
          const pincode = data?.address?.postcode?.replace(/\D/g, '').slice(0, 6) || '';
          const addr = data?.address;
          const liveAddr1 = [addr?.house_number, addr?.building].filter(Boolean).join(', ');
          const liveAddr2 = [addr?.road || addr?.pedestrian || addr?.footway].filter(Boolean).join(', ');
          const liveLandmark = [addr?.neighbourhood || addr?.suburb].filter(Boolean).join(', ');
          const liveCity  = addr?.city || addr?.town || addr?.village || addr?.county || '';
          setAddrForm((prev) => ({
            ...prev,
            addr1: prev.addr1?.trim() ? prev.addr1 : liveAddr1,
            addr2: prev.addr2?.trim() ? prev.addr2 : liveAddr2,
            landmark: prev.landmark?.trim() ? prev.landmark : liveLandmark,
            city:  prev.city?.trim()  ? prev.city  : liveCity,
            pincode: prev.pincode?.trim() ? prev.pincode : pincode,
          }));
        } catch {}
      },
      () => setGeo(g => ({ ...g, status: 'denied' })),
      { timeout: 8000 }
    );
  };

  const onSaveAddress = async () => {
    if (!addrForm.addr1.trim()) {
      setMessage({ type: 'error', text: 'Address Line 1 is required.' });
      return;
    }
    setAddrLoading(true); setMessage(null);
    try {
      const payload = { 
        ...addrForm, 
        address_line: buildAddressLine(addrForm), 
        full_name: user.full_name, 
        email: user.email,
        lat: geo.lat,
        lng: geo.lng,
      };
      const body = typeof addrOpen === 'number'
        ? { remove_address_index: addrOpen, add_address: payload }
        : { add_address: payload };
      const res     = await userApi.patch('/me', body);
      const updated = res.data?.data;
      setUser(updated); setUserInfo(updated);
      closeAddrForm();
      setMessage({ type: 'success', text: typeof addrOpen === 'number' ? 'Address updated.' : 'Address saved.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Could not save address.' });
    } finally {
      setAddrLoading(false);
    }
  };

  const onEditAddress = (idx) => {
    const a = (Array.isArray(user.saved_addresses) ? user.saved_addresses : [])[idx];
    if (!a) return;
    const parts = (a.address_line || '').split(',').map(s => s.trim());
    setAddrForm({ 
      label: a.label || '', 
      addr1: parts[0] || '', 
      addr2: parts[1] || '', 
      landmark: a.landmark || '', 
      city: parts[2] || '', 
      pincode: a.pincode || '', 
      phone: String(a.phone || '').replace(/^\+91/, '') 
    });
    if (a.lat != null && a.lng != null) {
      setGeo({ lat: Number(a.lat), lng: Number(a.lng), status: 'found' });
    }
    setAddrOpen(idx);
    setMessage(null);
  };

  const onRemoveAddress = async (idx) => {
    setMessage(null);
    try {
      const res     = await userApi.patch('/me', { remove_address_index: idx });
      const updated = res.data?.data;
      setUser(updated); setUserInfo(updated);
      setMessage({ type: 'success', text: 'Address removed.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Could not remove address.' });
    }
  };

  const onLogout = () => {
    clearUserToken();
    setUser(null);
    setMessage(null);
    window.dispatchEvent(new Event('user-auth-changed'));
  };

  if (!user) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
            <p className="heading-serif" style={{ fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--on-surface)' }}>
              CURATOR
            </p>
            <p style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)', marginTop: '0.25rem' }}>
              Your personal boutique
            </p>
          </div>

          <div className="auth-tabs" role="tablist">
            <button
              id="tab-signin"
              role="tab"
              aria-selected={tab === 'signin'}
              className={`auth-tab-btn${tab === 'signin' ? ' active' : ''}`}
              onClick={() => { setTab('signin'); setMessage(null); }}
            >
              Sign In
            </button>
            <button
              id="tab-signup"
              role="tab"
              aria-selected={tab === 'signup'}
              className={`auth-tab-btn${tab === 'signup' ? ' active' : ''}`}
              onClick={() => { setTab('signup'); setMessage(null); }}
            >
              Create Account
            </button>
            <div className="auth-tab-indicator" style={{ transform: tab === 'signup' ? 'translateX(100%)' : 'translateX(0)' }} />
          </div>

          {message && (
            <div style={{
              marginBottom: '1rem',
              padding: '0.7rem 1rem',
              borderRadius: 'var(--radius-sm)',
              background: message.type === 'success' ? '#D1FAE5' : 'var(--error-container)',
              color: message.type === 'success' ? '#065F46' : 'var(--error)',
              fontSize: '0.8125rem',
              fontWeight: 600,
            }}>
              {message.text}
            </div>
          )}

          {tab === 'signin' && (
            <form onSubmit={onSignIn} noValidate>
              <div style={{ marginBottom: '0.875rem' }}>
                <label className="label-caps" style={{ display: 'block', marginBottom: '0.35rem' }}>Email</label>
                <input
                  className="input-field input-rounded"
                  type="email"
                  placeholder="you@example.com"
                  value={loginForm.email}
                  onChange={e => setLoginForm(v => ({ ...v, email: e.target.value }))}
                  required
                  autoComplete="email"
                />
              </div>
              <div style={{ marginBottom: '1.25rem' }}>
                <label className="label-caps" style={{ display: 'block', marginBottom: '0.35rem' }}>Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="input-field input-rounded"
                    type={showPw ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={loginForm.password}
                    onChange={e => setLoginForm(v => ({ ...v, password: e.target.value }))}
                    required
                    autoComplete="current-password"
                    style={{ paddingRight: '3rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(p => !p)}
                    style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--outline)', lineHeight: 1 }}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                  >
                    <span className="material-symbols-rounded" style={{ fontSize: '1.2rem' }}>{showPw ? 'visibility_off' : 'visibility'}</span>
                  </button>
                </div>
              </div>
              <button
                className="btn-primary"
                type="submit"
                disabled={loading}
                style={{ width: '100%', padding: '0.875rem', fontSize: '0.9375rem' }}
              >
                {loading ? 'Signing in…' : 'Sign In →'}
              </button>
            </form>
          )}

          {tab === 'signup' && (
            <form onSubmit={onSignUp} noValidate>
              <div style={{ marginBottom: '0.875rem' }}>
                <label className="label-caps" style={{ display: 'block', marginBottom: '0.35rem' }}>Full Name</label>
                <input
                  className="input-field input-rounded"
                  type="text"
                  placeholder="Alex Kumar"
                  value={regForm.full_name}
                  onChange={e => setRegForm(v => ({ ...v, full_name: e.target.value }))}
                  required
                  autoComplete="name"
                />
              </div>
              <div style={{ marginBottom: '0.875rem' }}>
                <label className="label-caps" style={{ display: 'block', marginBottom: '0.35rem' }}>Email</label>
                <input
                  className="input-field input-rounded"
                  type="email"
                  placeholder="you@example.com"
                  value={regForm.email}
                  onChange={e => setRegForm(v => ({ ...v, email: e.target.value }))}
                  required
                  autoComplete="email"
                />
              </div>
              <div style={{ marginBottom: '1.25rem' }}>
                <label className="label-caps" style={{ display: 'block', marginBottom: '0.35rem' }}>Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="input-field input-rounded"
                    type={showRegPw ? 'text' : 'password'}
                    placeholder="Min. 8 characters"
                    value={regForm.password}
                    onChange={e => setRegForm(v => ({ ...v, password: e.target.value }))}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    style={{ paddingRight: '3rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegPw(p => !p)}
                    style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--outline)', lineHeight: 1 }}
                    aria-label={showRegPw ? 'Hide password' : 'Show password'}
                  >
                    <span className="material-symbols-rounded" style={{ fontSize: '1.2rem' }}>{showRegPw ? 'visibility_off' : 'visibility'}</span>
                  </button>
                </div>
              </div>
              <button
                className="btn-primary"
                type="submit"
                disabled={loading}
                style={{ width: '100%', padding: '0.875rem', fontSize: '0.9375rem' }}
              >
                {loading ? 'Creating account…' : 'Create Account →'}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  const initials     = getInitials(user.full_name);
  const addresses    = Array.isArray(user.saved_addresses) ? user.saved_addresses : [];
  const memberSince  = formatDate(user.created_at);

  const AddressForm = () => (
    <>
      {geo.status !== 'idle' && (
        <div style={{ marginBottom: '0.75rem', padding: '0.75rem', background: 'var(--surface-low)', borderRadius: 'var(--radius-sm)' }}>
          {geo.status === 'found' && (
            <p style={{ fontSize: '0.8125rem', color: '#065F46' }}>✓ Location captured ({geo.lat?.toFixed(4)}, {geo.lng?.toFixed(4)})</p>
          )}
          {geo.status === 'detecting' && (
            <p style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)' }}>📍 Detecting location…</p>
          )}
          {(geo.status === 'denied' || geo.status === 'unavailable') && (
            <p style={{ fontSize: '0.8125rem', color: 'var(--error)' }}>
              {geo.status === 'denied' ? '⚠️ Location access denied' : '⚠️ Geolocation not supported'}
            </p>
          )}
        </div>
      )}
      
      <button type="button" onClick={detectLocation} className="btn-secondary" style={{ width: '100%', padding: '0.625rem', fontSize: '0.8125rem', marginBottom: '0.875rem' }}>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
          <span className="material-symbols-rounded" style={{ fontSize: '1rem' }}>my_location</span>
          {geo.status === 'found' ? 'Update Location' : 'Pin My Location'}
        </span>
      </button>

      <div style={{ marginBottom: '0.75rem' }}>
        <p className="label-caps" style={{ marginBottom: '0.5rem', fontSize: '0.72rem' }}>Label</p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {['Home', 'Work'].map(lbl => (
            <button
              key={lbl}
              type="button"
              onClick={() => setAddrForm(f => ({ ...f, label: lbl }))}
              style={{
                padding: '0.5rem 1rem',
                fontSize: '0.8125rem',
                fontWeight: 600,
                border: '1px solid var(--outline-variant)',
                borderRadius: 'var(--radius-sm)',
                background: addrForm.label === lbl ? 'var(--primary)' : 'transparent',
                color: addrForm.label === lbl ? '#fff' : 'var(--on-surface)',
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
            value={!['Home', 'Work'].includes(addrForm.label) ? addrForm.label : ''}
            onChange={(e) => setAddrForm(f => ({ ...f, label: e.target.value }))}
            onFocus={() => { if (['Home', 'Work'].includes(addrForm.label)) setAddrForm(f => ({ ...f, label: '' })); }}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.8125rem',
              border: '1px solid var(--outline-variant)',
              borderRadius: 'var(--radius-sm)',
              background: !['Home', 'Work'].includes(addrForm.label) && addrForm.label ? 'var(--primary)' : 'transparent',
              color: !['Home', 'Work'].includes(addrForm.label) && addrForm.label ? '#fff' : 'var(--on-surface)',
              minWidth: '100px',
            }}
          />
        </div>
      </div>

      <AddrField label="Address Line 1 *" hint="Flat / House No., Building">
        <input className="input-field input-rounded" type="text" placeholder="Flat 4B, Sunrise Apartments"
          value={addrForm.addr1} onChange={e => setAddrForm(v => ({ ...v, addr1: e.target.value }))} autoComplete="address-line1" />
      </AddrField>
      <AddrField label="Address Line 2" hint="Street, Road, Colony">
        <input className="input-field input-rounded" type="text" placeholder="12 MG Road, Civil Lines"
          value={addrForm.addr2} onChange={e => setAddrForm(v => ({ ...v, addr2: e.target.value }))} autoComplete="address-line2" />
      </AddrField>
      <AddrField label="Landmark" hint="Nearby landmark">
        <input className="input-field input-rounded" type="text" placeholder="Near City Mall, Opposite Park"
          value={addrForm.landmark} onChange={e => setAddrForm(v => ({ ...v, landmark: e.target.value }))} />
      </AddrField>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem' }}>
        <AddrField label="City / Town">
          <input className="input-field input-rounded" type="text" placeholder="Agra"
            value={addrForm.city} onChange={e => setAddrForm(v => ({ ...v, city: e.target.value }))} autoComplete="address-level2" />
        </AddrField>
        <AddrField label="Pincode">
          <input className="input-field input-rounded" type="text" placeholder="282001"
            value={addrForm.pincode} onChange={e => setAddrForm(v => ({ ...v, pincode: e.target.value }))} inputMode="numeric" maxLength={6} />
        </AddrField>
      </div>
      <AddrField label="Phone">
        <input className="input-field input-rounded" type="text" placeholder="9876543210"
          value={addrForm.phone} onChange={e => setAddrForm(v => ({ ...v, phone: e.target.value }))} inputMode="numeric" maxLength={10} />
      </AddrField>
    </>
  );

  return (
    <div style={{ maxWidth: '540px', margin: '0 auto', padding: '2rem 1.25rem 7rem' }}>

      {message && (
        <div style={{
          marginBottom: '1rem',
          padding: '0.7rem 1rem',
          borderRadius: 'var(--radius-sm)',
          background: message.type === 'success' ? '#D1FAE5' : 'var(--error-container)',
          color: message.type === 'success' ? '#065F46' : 'var(--error)',
          fontSize: '0.8125rem',
          fontWeight: 600,
        }}>
          {message.text}
        </div>
      )}

      <div className="section-card" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <div className="avatar-circle">{initials || '?'}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: '0.15rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user.full_name || 'User'}
          </p>
          <p style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user.email}
          </p>
          {memberSince && (
            <p className="label-caps" style={{ marginTop: '0.35rem', fontSize: '0.68rem' }}>
              Member since {memberSince}
            </p>
          )}
        </div>
      </div>

      <div className="section-card">
        <p className="label-caps" style={{ marginBottom: '0.875rem' }}>Saved Addresses</p>

        {addresses.length === 0 && !addrOpen && (
          <p style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)', marginBottom: '0.75rem' }}>
            No saved addresses yet.
          </p>
        )}

        {addresses.map((a, idx) => (
          <div key={`${idx}-${a.pincode || ''}`}>
            <div className="addr-card">
              <span className="material-symbols-rounded" style={{ fontSize: '1.1rem', color: 'var(--outline)', marginTop: '0.15rem', flexShrink: 0 }}>location_on</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.15rem' }}>{a.label || `Address ${idx + 1}`}</p>
                <p style={{ fontSize: '0.8rem', color: 'var(--on-surface-variant)', lineHeight: 1.4 }}>
                  {a.address_line}{a.landmark ? ` • ${a.landmark}` : ''}{a.pincode ? ` — ${a.pincode}` : ''}
                </p>
              </div>
              <button type="button" onClick={() => onEditAddress(idx)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--outline)', padding: '0.25rem', flexShrink: 0, lineHeight: 1 }}
                aria-label="Edit address">
                <span className="material-symbols-rounded" style={{ fontSize: '1.1rem' }}>edit</span>
              </button>
              <button type="button" onClick={() => onRemoveAddress(idx)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--outline)', padding: '0.25rem', flexShrink: 0, lineHeight: 1 }}
                aria-label="Remove address">
                <span className="material-symbols-rounded" style={{ fontSize: '1.1rem' }}>close</span>
              </button>
            </div>

            {addrOpen === idx && (
              <div className="slide-down" style={{ margin: '0.25rem 0 0.75rem', padding: '1rem', border: '1px solid var(--primary)', borderRadius: 'var(--radius-sm)', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                <p className="label-caps" style={{ fontSize: '0.68rem', color: 'var(--primary)', marginBottom: '0.25rem' }}>Editing address {idx + 1}</p>
                <AddressForm />
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" className="btn-primary" disabled={addrLoading} onClick={onSaveAddress}
                    style={{ flex: 1, padding: '0.75rem', fontSize: '0.875rem' }}>
                    {addrLoading ? 'Saving…' : 'Update Address'}
                  </button>
                  <button type="button" className="btn-secondary" onClick={closeAddrForm}
                    style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        <button
          type="button"
          className="add-addr-toggle"
          onClick={() => addrOpen === 'add' ? closeAddrForm() : (closeAddrForm(), setAddrOpen('add'))}
          aria-expanded={addrOpen === 'add'}
        >
          <span className="material-symbols-rounded" style={{ fontSize: '1rem', transition: 'transform 0.2s ease', transform: addrOpen === 'add' ? 'rotate(45deg)' : 'rotate(0)' }}>add</span>
          {addrOpen === 'add' ? 'Cancel' : 'Add new address'}
        </button>

        {addrOpen === 'add' && (
          <div className="slide-down" style={{ marginTop: '0.875rem', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            <AddressForm />
            <button type="button" className="btn-primary" disabled={addrLoading} onClick={onSaveAddress}
              style={{ padding: '0.8rem', fontSize: '0.875rem', marginTop: '0.25rem' }}>
              {addrLoading ? 'Saving…' : 'Save Address'}
            </button>
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center', paddingTop: '0.5rem' }}>
        <button
          type="button"
          className="btn-ghost"
          onClick={onLogout}
          style={{ fontSize: '0.8125rem' }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
