import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '../lib/api';
import { fmtPrice, fmtDate, statusBadgeClass } from '../lib/format';
import { useToast } from '../contexts/ToastContext';

export default function Dispatch() {
  const toast = useToast();
  const [zones, setZones] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState({}); // batchId → empId state
  const [dispatching, setDispatching] = useState(null);

  const fetchReady = useCallback(() => {
    setLoading(true);
    Promise.all([adminApi.get('/dispatch/ready'), adminApi.get('/zones')])
      .then(([dRes, zRes]) => {
        setZones(dRes.data.data ?? []);
        // Build staff indexed by zone
        return adminApi.get('/zones');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchReady(); }, [fetchReady]);

  const fetchStaffForZone = async (zoneId) => {
    try {
      // Get all staff and filter by zone in frontend (no dedicated endpoint)
      const res = await adminApi.get(`/staff`).catch(() => ({ data: { data: [] } }));
      return (res.data.data ?? []).filter(s => String(s.zone_id) === String(zoneId) && s.is_active);
    } catch {
      return [];
    }
  };

  const assign = async (batchId, empId) => {
    try {
      await adminApi.post(`/dispatch/batches/${batchId}/assign`, { emp_id: empId });
      toast('Employee assigned!', 'success');
      fetchReady();
    } catch (err) {
      toast(err.response?.data?.message ?? 'Assign failed', 'error');
    }
  };

  const dispatch = async (batchId) => {
    setDispatching(batchId);
    try {
      const res = await adminApi.post(`/dispatch/batches/${batchId}/dispatch`);
      toast(`Dispatched ${res.data.data?.stop_count} stops!`, 'success');
      fetchReady();
    } catch (err) {
      toast(err.response?.data?.message ?? 'Dispatch failed', 'error');
    } finally {
      setDispatching(null);
    }
  };

  // Inline EMP dropdown per zone
  const ZoneRow = ({ z }) => {
    const [empId, setEmpId] = useState(z.emp_id ?? '');
    const [staffList, setStaffList] = useState([]);
    const [loadingStaff, setLoadingStaff] = useState(false);

    useEffect(() => {
      setLoadingStaff(true);
      fetchStaffForZone(z.zone_id).then(s => { setStaffList(s); }).finally(() => setLoadingStaff(false));
    }, [z.zone_id]);

    return (
      <tr>
        <td style={{ fontWeight: 700 }}>{z.zone_label}</td>
        <td className="text-sm">{z.city_label ?? '—'}</td>
        <td className="text-sm">{z.pending_order_count ?? '—'}</td>
        <td className="font-mono text-xs" style={{ color: 'var(--primary)' }}>{z.batch_id?.slice(-8)}</td>
        <td><span className={statusBadgeClass(z.batch_status ?? 'READY')}>{z.batch_status ?? 'READY'}</span></td>
        <td>
          {z.batch_status === 'DISPATCHED' ? (
            <span className="text-sm text-muted">Already dispatched</span>
          ) : (
            <div className="flex gap-2 items-center">
              <select
                className="input"
                style={{ minWidth: 160 }}
                value={empId}
                onChange={e => setEmpId(e.target.value)}
                disabled={loadingStaff}
              >
                <option value="">— Select EMP —</option>
                {staffList.map(s => <option key={s.id} value={s.id}>{s.emp_id} — {s.full_name}</option>)}
              </select>
              <button className="btn btn-ghost btn-sm" disabled={!empId} onClick={() => assign(z.batch_id, empId)}>
                Assign
              </button>
              <button
                className="btn btn-primary btn-sm"
                disabled={dispatching === z.batch_id || !z.emp_id}
                onClick={() => dispatch(z.batch_id)}
              >
                {dispatching === z.batch_id ? 'Dispatching…' : '→ Dispatch'}
              </button>
            </div>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-muted">Zones meeting the dispatch threshold (order count + cutoff time)</p>
        <button className="btn btn-ghost btn-sm" onClick={fetchReady}><span className="icon">refresh</span> Refresh</button>
      </div>

      {loading ? <div className="spinner" /> : (
        <div className="card">
          {zones.length === 0 ? (
            <div className="empty-state">
              <span style={{ fontSize: '2rem', display: 'block', marginBottom: '1rem' }}>📦</span>
              No zones are ready to dispatch yet.<br />
              <span className="text-muted text-sm">Orders need to meet the zone's minimum count and be placed before the cutoff time.</span>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Zone</th><th>City</th><th>Pending Orders</th><th>Batch ID</th><th>Status</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {zones.map(z => <ZoneRow key={z.batch_id ?? z.zone_id} z={z} />)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
