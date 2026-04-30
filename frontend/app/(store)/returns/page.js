'use client';
import { useEffect, useState } from 'react';
import { returnsApi } from '@/lib/api';
import { getUserToken } from '@/lib/api';
import { formatPrice } from '@/lib/format';

const RETURN_REASONS = [
  'Wrong item received',
  'Size issue',
  'Damaged product',
  'Quality not as expected',
  'Other',
];

const EMPTY_FORM = { order_number: '', reason: '', other_reason: '' };

export default function ReturnsPage() {
  const [form, setForm]           = useState(EMPTY_FORM);
  const [eligibleOrders, setEligibleOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [returnRequests, setReturnRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState({ tagBill: false, unworn: false, agree: false });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult]       = useState(null);   // success return object
  const [apiError, setApiError]   = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const loadEligibleOrders = async () => {
    const token = getUserToken();
    if (!token) {
      setApiError('Please login to see your eligible delivered orders.');
      return;
    }

    setLoadingOrders(true);
    setApiError(null);
    try {
      const res = await returnsApi.get('/eligible-orders', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = res.data?.data ?? res.data;
      setEligibleOrders(data.orders ?? []);
    } catch (err) {
      setApiError(err.response?.data?.message ?? 'Could not load eligible orders.');
    } finally {
      setLoadingOrders(false);
    }
  };

  const loadMyReturnRequests = async () => {
    const token = getUserToken();
    if (!token) return;

    setLoadingRequests(true);
    try {
      const res = await returnsApi.get('/my-requests', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = res.data?.data ?? res.data;
      setReturnRequests(data.returns ?? []);
    } catch {
      // Keep this section non-blocking for the form.
    } finally {
      setLoadingRequests(false);
    }
  };

  useEffect(() => {
    loadEligibleOrders();
    loadMyReturnRequests();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({
      ...f,
      [name]: value,
      ...(name === 'reason' && value !== 'Other' ? { other_reason: '' } : {}),
    }));
    setFieldErrors(fe => ({ ...fe, [name]: null }));
    if (name === 'reason' && value !== 'Other') {
      setFieldErrors((fe) => ({ ...fe, other_reason: null }));
    }
    setApiError(null);
  };

  const validate = () => {
    const errs = {};
    if (!form.order_number.trim()) errs.order_number = 'Order number is required';
    if (!form.reason.trim()) errs.reason = 'Please select a reason';
    if (form.reason === 'Other' && form.other_reason.trim().length < 5) {
      errs.other_reason = 'Please enter at least 5 characters';
    }
    return errs;
  };

  const submitReturn = async () => {
    const token = getUserToken();
    if (!token) {
      setApiError('Please login to submit return request.');
      return;
    }
    setSubmitting(true);
    setApiError(null);
    try {
      const res = await returnsApi.post('/', {
        order_number: form.order_number.trim(),
        reason:       form.reason === 'Other' ? form.other_reason.trim() : form.reason.trim(),
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setResult(res.data?.data ?? res.data);
    } catch (err) {
      const msg = err.response?.data?.message ?? 'Could not submit return request.';
      if (err.response?.status === 422) {
        setApiError(msg);
      } else if (err.response?.status === 409) {
        setApiError('A return has already been requested for this order.');
      } else {
        setApiError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrimarySubmit = (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }
    setShowTermsModal(true);
  };

  const allTermsAccepted = termsAccepted.tagBill && termsAccepted.unworn && termsAccepted.agree;

  const confirmTermsAndSubmit = async () => {
    if (!allTermsAccepted) return;
    setShowTermsModal(false);
    await submitReturn();
    await loadMyReturnRequests();
  };

  // ── Success state ──────────────────────────────────────────────
  if (result) {
    return (
      <div style={{ padding: '2rem 1.5rem', textAlign: 'center' }}>
        <div style={{
          width: '4rem', height: '4rem', borderRadius: '50%',
          background: '#D1FAE5', display: 'flex', alignItems: 'center',
          justifyContent: 'center', margin: '0 auto 1.25rem',
        }}>
          <span className="material-symbols-rounded" style={{ fontSize: '2rem', color: '#065F46' }}>assignment_return</span>
        </div>
        <h1 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: '1.5rem', marginBottom: '0.5rem' }}>
          Return Requested
        </h1>
        <p className="body-md" style={{ color: 'var(--on-surface-variant)', fontSize: '0.9rem', marginBottom: '2rem' }}>
          {result.message ?? 'Our team will review within 24 hours.'}
        </p>

        <div style={{ background: 'var(--surface-white)', borderRadius: '0.75rem', padding: '1.5rem', textAlign: 'left' }} className="card-shadow">
          <Row label="Return ID" value={<span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)' }}>{result.return_id}</span>} />
          <Row label="Order Number" value={`#${result.order_number}`} />
          <Row label="Status" value={<span className="status-badge" style={{ background: '#FFF3CD', color: '#856404' }}>{result.status}</span>} last />
        </div>

        <button
          onClick={() => {
            setForm(EMPTY_FORM);
            setResult(null);
            setTermsAccepted({ tagBill: false, unworn: false, agree: false });
            loadEligibleOrders();
          }}
          className="btn-secondary"
          style={{ width: '100%', padding: '0.875rem', marginTop: '1.25rem' }}
        >
          Submit Another Return
        </button>
      </div>
    );
  }

  // ── Form ───────────────────────────────────────────────────────
  return (
    <div className="page-shell">
      <h1 className="heading-serif" style={{ fontSize: '2rem', marginBottom: '0.375rem' }}>
        Request a Return
      </h1>
      <p className="body-md" style={{ color: 'var(--on-surface-variant)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
        Select an order delivered in the last 7 days and submit your return request.
      </p>
      <div style={{ background: 'var(--surface-low)', borderRadius: '0.375rem', padding: '0.75rem 1rem', marginBottom: '1rem', fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '0.8125rem', color: 'var(--on-surface-variant)' }}>
        You can return only items that are unused and still have original tag and bill.
      </div>

      {eligibleOrders.length === 0 && !loadingOrders && (
        <div style={{ background: 'var(--surface-white)', borderRadius: '0.5rem', padding: '0.875rem', marginBottom: '1rem', fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '0.875rem', color: 'var(--on-surface-variant)' }}>
          No delivered orders found within the last 7 days.
        </div>
      )}

      <form onSubmit={handlePrimarySubmit} noValidate>
        <Field label="Select Order" error={fieldErrors.order_number}>
          <select
            name="order_number"
            value={form.order_number}
            onChange={handleChange}
            className="input-field"
            disabled={loadingOrders || eligibleOrders.length === 0}
          >
            <option value="">{loadingOrders ? 'Loading eligible orders...' : 'Select your order'}</option>
            {eligibleOrders.map((ord) => (
              <option key={ord.order_number} value={ord.order_number}>
                {ord.order_number} - {new Date(ord.delivered_at).toLocaleDateString('en-IN')} - {formatPrice(ord.total_paise)}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Reason for Return" error={fieldErrors.reason}>
          <select
            name="reason"
            value={form.reason}
            onChange={handleChange}
            className="input-field"
          >
            <option value="">Select reason</option>
            {RETURN_REASONS.map((reason) => (
              <option key={reason} value={reason}>{reason}</option>
            ))}
          </select>
        </Field>

        {form.reason === 'Other' && (
          <Field label="Other Reason" error={fieldErrors.other_reason}>
            <textarea
              name="other_reason"
              value={form.other_reason}
              onChange={handleChange}
              placeholder="Please mention your reason..."
              className="input-field"
              rows={3}
              style={{ resize: 'vertical' }}
            />
          </Field>
        )}

        {apiError && (
          <div style={{ background: 'var(--error-container)', color: 'var(--error)', padding: '0.875rem', borderRadius: '0.375rem', fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '0.875rem', marginBottom: '1rem' }}>
            {apiError}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || loadingOrders || eligibleOrders.length === 0}
          className="btn-primary"
          style={{ width: '100%', padding: '1rem', fontSize: '0.9375rem', borderRadius: '0.5rem' }}
        >
          {submitting ? 'Submitting…' : 'Submit Return Request'}
        </button>
      </form>

      <div style={{ marginTop: '1rem', background: 'var(--surface-white)', border: '1px solid var(--outline-variant)', padding: '1rem' }}>
        <h3 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.75rem' }}>
          Your Return Requests
        </h3>

        {loadingRequests && (
          <p style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '0.85rem', color: 'var(--on-surface-variant)' }}>
            Loading return requests...
          </p>
        )}

        {!loadingRequests && returnRequests.length === 0 && (
          <p style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '0.85rem', color: 'var(--on-surface-variant)' }}>
            No return requests yet.
          </p>
        )}

        {!loadingRequests && returnRequests.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {returnRequests.map((ret) => (
              <div
                key={ret.return_id}
                style={{
                  border: '1px solid var(--surface-high)',
                  borderRadius: '0.5rem',
                  padding: '0.7rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                }}
              >
                <div>
                  <p style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.78rem', color: 'var(--primary)', margin: 0 }}>
                    {ret.return_id}
                  </p>
                  <p style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '0.8rem', color: 'var(--on-surface-variant)', margin: '0.2rem 0 0 0' }}>
                    Order: {ret.order_number}
                  </p>
                </div>
                <span className="status-badge">{ret.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {showTermsModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50,
          padding: '1rem',
        }}>
          <div style={{ width: '100%', maxWidth: '28rem', background: 'var(--surface-white)', borderRadius: '0.75rem', padding: '1rem' }}>
            <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: '1.05rem', marginBottom: '0.5rem' }}>
              Return Terms & Conditions
            </h2>
            <p style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '0.85rem', color: 'var(--on-surface-variant)', marginBottom: '0.75rem' }}>
              Please confirm all conditions before submitting:
            </p>

            <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginBottom: '0.55rem', fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '0.87rem' }}>
              <input
                type="checkbox"
                checked={termsAccepted.tagBill}
                onChange={(e) => setTermsAccepted((t) => ({ ...t, tagBill: e.target.checked }))}
              />
              1. Product has original tag and bill.
            </label>
            <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginBottom: '0.55rem', fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '0.87rem' }}>
              <input
                type="checkbox"
                checked={termsAccepted.unworn}
                onChange={(e) => setTermsAccepted((t) => ({ ...t, unworn: e.target.checked }))}
              />
              2. Product is in unworn condition.
            </label>
            <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginBottom: '1rem', fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '0.87rem' }}>
              <input
                type="checkbox"
                checked={termsAccepted.agree}
                onChange={(e) => setTermsAccepted((t) => ({ ...t, agree: e.target.checked }))}
              />
              I agree that failing to meet the above conditions may result in rejection of this return.
            </label>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn-secondary"
                style={{ flex: 1, padding: '0.75rem' }}
                onClick={() => setShowTermsModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                style={{ flex: 1, padding: '0.75rem' }}
                disabled={!allTermsAccepted || submitting}
                onClick={confirmTermsAndSubmit}
              >
                {submitting ? 'Submitting…' : 'I Agree & Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, last }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 0', borderBottom: last ? 'none' : '1px solid var(--surface-high)' }}>
      <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 500, fontSize: '0.875rem', color: 'var(--on-surface-variant)' }}>{label}</span>
      <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 600, fontSize: '0.875rem' }}>{value}</span>
    </div>
  );
}

function Field({ label, hint, error, children }) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <label style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 600, fontSize: '0.8125rem', color: 'var(--on-surface-variant)', display: 'block', marginBottom: '0.35rem', letterSpacing: '0.04em' }}>
        {label} {hint && <span style={{ fontWeight: 400, color: 'var(--outline)' }}>— {hint}</span>}
      </label>
      {children}
      {error && <p style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", color: 'var(--error)', fontSize: '0.75rem', marginTop: '0.25rem' }}>{error}</p>}
    </div>
  );
}
