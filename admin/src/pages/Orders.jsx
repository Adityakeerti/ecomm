import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '../lib/api';
import { fmtPrice, fmtDateTime, statusBadgeClass } from '../lib/format';
import { useToast } from '../contexts/ToastContext';

const STATUSES = ['', 'PENDING', 'PROCESSING', 'DISPATCHED', 'DELIVERED', 'CANCELLED', 'FAILED'];

export default function Orders() {
  const toast = useToast();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [selected, setSelected] = useState(null); // order detail modal

  const fetchOrders = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: 20 });
    if (filterStatus) params.set('status', filterStatus);
    adminApi.get(`/orders?${params}`)
      .then(res => {
        setOrders(res.data.data ?? []);
        setPagination(res.data.pagination);
      })
      .finally(() => setLoading(false));
  }, [page, filterStatus]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const updateStatus = async (id, status) => {
    try {
      await adminApi.patch(`/orders/${id}/status`, { status });
      toast('Status updated', 'success');
      fetchOrders();
      setSelected(s => s ? { ...s, status } : s);
    } catch (err) {
      toast(err.response?.data?.message ?? 'Update failed', 'error');
    }
  };

  const openDetail = async (order) => {
    try {
      const res = await adminApi.get(`/orders/${order.id}`);
      setSelected(res.data.data);
    } catch {
      toast('Could not load order details', 'error');
    }
  };

  return (
    <div>
      <div className="filter-row">
        <select className="input" value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}>
          {STATUSES.map(s => <option key={s} value={s}>{s || 'All Statuses'}</option>)}
        </select>
        <button className="btn btn-ghost btn-sm" onClick={fetchOrders}><span className="icon">refresh</span> Refresh</button>
      </div>

      {loading ? <div className="spinner" /> : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Order #</th><th>Customer</th><th>Phone</th>
                  <th>Total</th><th>Zone</th><th>Status</th>
                  <th>Payment</th><th>Date</th><th></th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0
                  ? <tr><td colSpan={9} className="empty-state">No orders found.</td></tr>
                  : orders.map(o => (
                    <tr key={o.id}>
                      <td className="font-mono text-sm" style={{ color: 'var(--primary)' }}>{o.order_number}</td>
                      <td className="text-sm">{o.customer_name}</td>
                      <td className="text-sm text-muted">{o.customer_phone}</td>
                      <td className="text-sm" style={{ fontWeight: 700 }}>{fmtPrice(o.total_paise)}</td>
                      <td className="text-sm">{o.zone_label ?? '—'}</td>
                      <td><span className={statusBadgeClass(o.status)}>{o.status}</span></td>
                      <td><span className={statusBadgeClass(o.payment_status)}>{o.payment_status}</span></td>
                      <td className="text-xs text-muted">{fmtDateTime(o.created_at)}</td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => openDetail(o)}>
                          <span className="icon">open_in_new</span>
                        </button>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination && pagination.pages > 1 && (
            <div className="flex gap-2 items-center mt-4" style={{ justifyContent: 'center' }}>
              <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
              <span className="text-sm text-muted">Page {pagination.page} of {pagination.pages}</span>
              <button className="btn btn-ghost btn-sm" disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)}>Next →</button>
            </div>
          )}
        </div>
      )}

      {/* Order Detail Modal */}
      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">
              <span>Order <span className="font-mono" style={{ color: 'var(--primary)' }}>#{selected.order_number}</span></span>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}><span className="icon">close</span></button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 1.5rem', marginBottom: '1.25rem' }}>
              {[
                ['Customer', selected.customer_name],
                ['Phone', selected.customer_phone],
                ['Email', selected.customer_email ?? '—'],
                ['Zone', selected.zone_label ?? '—'],
                ['Total', fmtPrice(selected.total_paise)],
                ['Status', <span className={statusBadgeClass(selected.status)}>{selected.status}</span>],
                ['Payment', <span className={statusBadgeClass(selected.payment_status)}>{selected.payment_status}</span>],
                ['Date', fmtDateTime(selected.created_at)],
              ].map(([label, val]) => (
                <div key={label}>
                  <div className="text-xs text-muted">{label}</div>
                  <div className="text-sm" style={{ fontWeight: 600, marginTop: '2px' }}>{val}</div>
                </div>
              ))}
            </div>

            {selected.delivery_address && (
              <div className="mb-4">
                <div className="text-xs text-muted mb-1">Delivery Address</div>
                <p className="text-sm" style={{ background: 'var(--surface)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius)' }}>
                  {selected.delivery_address}
                </p>
              </div>
            )}

            {selected.items?.length > 0 && (
              <div className="mb-4">
                <div className="card-title text-sm">Line Items</div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Product</th><th>SKU</th><th>Qty</th><th>Subtotal</th></tr></thead>
                    <tbody>
                      {selected.items.map(i => (
                        <tr key={i.id}>
                          <td className="text-sm">{i.product_name}</td>
                          <td className="text-xs font-mono text-muted">{i.sku}</td>
                          <td className="text-sm">{i.quantity}</td>
                          <td className="text-sm">{fmtPrice(i.subtotal_paise)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div>
              <div className="text-xs text-muted mb-2" style={{ letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 700 }}>Update Status</div>
              <div className="pill-toggle">
                {['PENDING','PROCESSING','DISPATCHED','DELIVERED','CANCELLED'].map(s => (
                  <button
                    key={s}
                    className={`btn btn-sm ${selected.status === s ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => updateStatus(selected.id, s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
