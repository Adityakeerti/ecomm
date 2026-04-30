import { useEffect, useState } from 'react';
import { adminApi } from '../lib/api';
import { fmtPrice, fmtDate, statusBadgeClass } from '../lib/format';

const StatCard = ({ label, value, sub, accent }) => (
  <div className="stat-card">
    <div className="label">{label}</div>
    <div className="value" style={accent ? { color: 'var(--primary)' } : {}}>{value}</div>
    {sub && <div className="sub">{sub}</div>}
  </div>
);

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      adminApi.get('/overview'),
      adminApi.get('/orders?limit=5'),
      adminApi.get('/returns?limit=5&status=REQUESTED'),
    ])
      .then(([ovRes, ordRes, retRes]) => {
        setStats(ovRes.data.stats);
        setRecentOrders(ordRes.data.data ?? []);
        setReturns(retRes.data.data ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="spinner" />;

  return (
    <div>
      <div className="stat-grid">
        <StatCard label="Orders Today"      value={stats.ordersToday}       />
        <StatCard label="Revenue Today"     value={fmtPrice(stats.revenueTodayPaise)} accent />
        <StatCard label="Pending Orders"    value={stats.pendingOrders}     sub="Awaiting dispatch" />
        <StatCard label="En Route"          value={stats.dispatchedOrders}  sub="Active deliveries" />
        <StatCard label="Dispatch-Ready Zones" value={stats.dispatchReadyZones} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
        {/* Recent Orders */}
        <div className="card">
          <div className="card-title">Recent Orders</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Order #</th><th>Customer</th><th>Total</th><th>Status</th></tr></thead>
              <tbody>
                {recentOrders.length === 0
                  ? <tr><td colSpan={4} className="empty-state">No orders yet</td></tr>
                  : recentOrders.map(o => (
                    <tr key={o.id}>
                      <td className="font-mono text-sm" style={{ color: 'var(--primary)' }}>{o.order_number}</td>
                      <td className="text-sm">{o.customer_name}</td>
                      <td className="text-sm">{fmtPrice(o.total_paise)}</td>
                      <td><span className={statusBadgeClass(o.status)}>{o.status}</span></td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>

        {/* Pending Returns */}
        <div className="card">
          <div className="card-title">Pending Returns</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Return ID</th><th>Order</th><th>Reason</th><th>Status</th></tr></thead>
              <tbody>
                {returns.length === 0
                  ? <tr><td colSpan={4} className="empty-state">No pending returns</td></tr>
                  : returns.map(r => (
                    <tr key={r.id}>
                      <td className="font-mono text-sm" style={{ color: 'var(--primary)' }}>{r.return_id}</td>
                      <td className="text-sm">{r.order_number}</td>
                      <td className="text-sm truncate" style={{ maxWidth: '120px' }}>{r.reason}</td>
                      <td><span className={statusBadgeClass(r.status)}>{r.status}</span></td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
