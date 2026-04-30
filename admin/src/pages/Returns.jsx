import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '../lib/api';
import { fmtPrice, fmtDateTime, statusBadgeClass } from '../lib/format';
import { useToast } from '../contexts/ToastContext';

const RETURN_STATUSES = ['', 'REQUESTED', 'APPROVED', 'REJECTED', 'REFUNDED'];

export default function Returns() {
  const toast = useToast();
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [modal, setModal] = useState(null); // return record for action

  const fetchReturns = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: 20 });
    if (filterStatus) params.set('status', filterStatus);
    adminApi.get(`/returns?${params}`)
      .then(res => {
        setReturns(res.data.data ?? []);
        setPagination(res.data.pagination);
      })
      .finally(() => setLoading(false));
  }, [page, filterStatus]);

  useEffect(() => { fetchReturns(); }, [fetchReturns]);

  const [actionForm, setActionForm] = useState({ status: '', admin_notes: '', refund_ref: '' });
  const [saving, setSaving] = useState(false);

  const openAction = (r) => {
    setModal(r);
    setActionForm({ status: r.status, admin_notes: r.admin_notes ?? '', refund_ref: r.refund_ref ?? '' });
  };

  const updateReturn = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await adminApi.patch(`/returns/${modal.id}`, actionForm);
      toast('Return updated!', 'success');
      setModal(null);
      fetchReturns();
    } catch (err) {
      toast(err.response?.data?.message ?? 'Update failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="filter-row">
        <select className="input" value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}>
          {RETURN_STATUSES.map(s => <option key={s} value={s}>{s || 'All Statuses'}</option>)}
        </select>
        <button className="btn btn-ghost btn-sm" onClick={fetchReturns}><span className="icon">refresh</span></button>
      </div>

      {loading ? <div className="spinner" /> : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Return ID</th><th>Order</th><th>Customer</th><th>Reason</th><th>Amount</th><th>Status</th><th>Date</th><th></th></tr>
              </thead>
              <tbody>
                {returns.length === 0
                  ? <tr><td colSpan={8} className="empty-state">No returns found.</td></tr>
                  : returns.map(r => (
                    <tr key={r.id}>
                      <td className="font-mono text-sm" style={{ color: 'var(--primary)' }}>{r.return_id}</td>
                      <td className="font-mono text-sm">{r.order_number}</td>
                      <td className="text-sm">{r.customer_name}</td>
                      <td className="text-sm truncate" style={{ maxWidth: 180 }}>{r.reason}</td>
                      <td className="text-sm" style={{ fontWeight: 700 }}>{(r.total_paise / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}</td>
                      <td><span className={statusBadgeClass(r.status)}>{r.status}</span></td>
                      <td className="text-xs text-muted">{fmtDateTime(r.requested_at)}</td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => openAction(r)}>
                          <span className="icon">edit</span>
                        </button>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
          {pagination && pagination.pages > 1 && (
            <div className="flex gap-2 items-center mt-4" style={{ justifyContent: 'center' }}>
              <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
              <span className="text-sm text-muted">Page {pagination.page} of {pagination.pages}</span>
              <button className="btn btn-ghost btn-sm" disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)}>Next →</button>
            </div>
          )}
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">
              Return <span className="font-mono" style={{ color: 'var(--primary)' }}>{modal.return_id}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}><span className="icon">close</span></button>
            </div>
            <div style={{ marginBottom: '1rem', background: 'var(--surface)', borderRadius: 'var(--radius)', padding: '0.75rem 1rem' }}>
              <p className="text-sm" style={{ fontWeight: 600 }}>{modal.customer_name} — {modal.customer_phone}</p>
              <p className="text-sm text-muted mt-1">Order: {modal.order_number}</p>
              <p className="text-sm mt-1"><strong>Reason:</strong> {modal.reason}</p>
            </div>
            <form onSubmit={updateReturn}>
              <div className="field">
                <label>Status</label>
                <select className="input" value={actionForm.status} onChange={e => setActionForm(f => ({ ...f, status: e.target.value }))}>
                  {['REQUESTED','APPROVED','REJECTED','REFUNDED'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Admin Notes</label>
                <textarea className="input" value={actionForm.admin_notes} onChange={e => setActionForm(f => ({ ...f, admin_notes: e.target.value }))} rows={2} placeholder="Internal notes…" />
              </div>
              {actionForm.status === 'REFUNDED' && (
                <div className="field">
                  <label>Refund Reference *</label>
                  <input className="input" value={actionForm.refund_ref} onChange={e => setActionForm(f => ({ ...f, refund_ref: e.target.value }))} placeholder="e.g. PhonePe refund ID" required />
                </div>
              )}
              <div className="flex gap-3">
                <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" disabled={saving} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                  {saving ? 'Saving…' : 'Update Return'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
