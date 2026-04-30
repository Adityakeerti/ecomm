import { useEffect, useState, useCallback } from 'react';
import { deliveryApi, clearEmpToken } from '../api';

const fmtPrice = (p) => (p == null ? '—' : (p / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }));

export default function BatchScreen({ emp, onComplete, onLogout }) {
  const [batch, setBatch] = useState(null);
  const [stops, setStops] = useState([]);
  const [loadingBatch, setLoadingBatch] = useState(true);
  const [loadingStops, setLoadingStops] = useState(false);
  const [error, setError] = useState(null);

  // Fail modal state
  const [failModal, setFailModal] = useState(null); // stop object
  const [failReason, setFailReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchBatch = useCallback(async () => {
    setLoadingBatch(true);
    setError(null);
    try {
      const res = await deliveryApi.get('/batch/active');
      const b = res.data.data;
      setBatch(b);
      if (b) {
        await fetchStops(b.id);
      }
    } catch (err) {
      setError(err.response?.data?.message ?? 'Could not load batch.');
    } finally {
      setLoadingBatch(false);
    }
  }, []);

  const fetchStops = useCallback(async (batchId) => {
    setLoadingStops(true);
    try {
      const res = await deliveryApi.get(`/batch/${batchId}/stops`);
      setStops(res.data.data ?? []);
    } catch {
      setError('Could not load stops.');
    } finally {
      setLoadingStops(false);
    }
  }, []);

  useEffect(() => { fetchBatch(); }, [fetchBatch]);

  const handleDeliver = async (stop) => {
    setActionLoading(stop.stop_id);
    try {
      const res = await deliveryApi.patch(`/stops/${stop.stop_id}/deliver`);
      const data = res.data.data;
      if (data.batch_complete) {
        const delivered = stops.filter(s => s.stop_status === 'DELIVERED').length + 1;
        const failed    = stops.filter(s => s.stop_status === 'FAILED').length;
        onComplete({ delivered, failed, total: stops.length });
        return;
      }
      await fetchStops(batch.id);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Could not mark delivered.');
    } finally {
      setActionLoading(null);
    }
  };

  const openFail = (stop) => { setFailModal(stop); setFailReason(''); };

  const handleFail = async (e) => {
    e.preventDefault();
    if (!failReason.trim()) return;
    setActionLoading(failModal.stop_id);
    try {
      const res = await deliveryApi.patch(`/stops/${failModal.stop_id}/fail`, { failure_reason: failReason.trim() });
      const data = res.data.data;
      setFailModal(null);
      if (data.batch_complete) {
        const withFail = [...stops];
        const delivered = withFail.filter(s => s.stop_status === 'DELIVERED').length;
        const failed    = withFail.filter(s => s.stop_status === 'FAILED').length + 1;
        onComplete({ delivered, failed, total: withFail.length });
        return;
      }
      await fetchStops(batch.id);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Could not mark failed.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleLogout = () => {
    clearEmpToken();
    onLogout();
  };

  // Map URL (no Google, use OpenStreetMap)
  const buildMapUrl = () => {
    if (!stops.length) return null;
    const activePending = stops.find(s => s.stop_status === 'PENDING' && s.is_unlocked);
    if (activePending?.lat && activePending?.lng) {
      return `https://www.openstreetmap.org/export/embed.html?bbox=${activePending.lng - 0.01},${activePending.lat - 0.01},${activePending.lng + 0.01},${activePending.lat + 0.01}&layer=mapnik&marker=${activePending.lat},${activePending.lng}`;
    }
    return null;
  };

  const completedCount = stops.filter(s => ['DELIVERED','FAILED'].includes(s.stop_status)).length;
  const progress = stops.length > 0 ? (completedCount / stops.length) * 100 : 0;

  if (loadingBatch) return (
    <div style={{ minHeight: '100dvh', background: 'var(--on-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" style={{ borderTopColor: '#fff', borderColor: 'rgba(255,255,255,0.15)' }} />
    </div>
  );

  if (!batch) return (
    <div style={{ minHeight: '100dvh', background: 'var(--on-surface)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', padding: '2rem', textAlign: 'center' }}>
      <span className="icon" style={{ fontSize: '3rem', marginBottom: '1rem' }}>inventory_2</span>
      <h2 style={{ fontWeight: 800, fontSize: '1.25rem', marginBottom: '0.5rem' }}>No Active Batch</h2>
      <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: '2rem', fontSize: '0.875rem' }}>
        Your batch hasn't been dispatched yet.<br />Check back after the admin dispatches orders.
      </p>
      <button className="btn btn-ghost" onClick={handleLogout}>Sign Out</button>
    </div>
  );

  const mapUrl = buildMapUrl();

  return (
    <div style={{ minHeight: '100dvh', overflowY: 'auto' }}>
      {/* Header */}
      <div className="batch-header">
        <div>
          <h2>CURATOR Delivery</h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginTop: '2px' }}>
            {batch.zone_label} — {emp?.empId ?? ''}
          </p>
        </div>
        <button className="btn btn-ghost" style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem' }} onClick={handleLogout}>
          <span className="icon" style={{ fontSize: '0.9rem' }}>logout</span> Out
        </button>
      </div>

      {/* Progress */}
      <div className="progress-wrap">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: '0.8125rem' }}>
            {completedCount} of {stops.length} stops
          </span>
          <span style={{ fontWeight: 800, fontSize: '0.8125rem', color: 'var(--primary)' }}>
            {Math.round(progress)}%
          </span>
        </div>
        <div className="progress-bar-bg">
          <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {error && <div className="error-msg">{error}</div>}

      {/* Map for active stop */}
      {mapUrl && (
        <div style={{ margin: '0.75rem 1rem', borderRadius: '8px', overflow: 'hidden', height: '200px' }}>
          <iframe
            title="Delivery Map"
            src={mapUrl}
            style={{ width: '100%', height: '100%', border: 'none' }}
          />
        </div>
      )}

      {/* Stop cards */}
      {loadingStops ? <div className="spinner" /> : (
        stops.map(stop => {
          const isDone   = ['DELIVERED','FAILED'].includes(stop.stop_status);
          const isLocked = !stop.is_unlocked;
          const isCurrent = stop.stop_status === 'PENDING' && stop.is_unlocked;

          const numClass = `stop-num ${stop.stop_status === 'DELIVERED' ? 'done' : stop.stop_status === 'FAILED' ? 'fail' : isLocked ? 'lock' : ''}`;

          return (
            <div key={stop.stop_id} className={`stop-card ${isLocked ? 'locked' : isDone ? 'completed' : ''}`}>
              <div className="stop-header">
                <div className={numClass}>{stop.stop_number}</div>
                <div className="stop-info" style={{ flex: 1 }}>
                  <h3>{stop.customer_name}</h3>
                  <p>{stop.address_line}</p>
                  <a className="call-link mt-1" href={`tel:${stop.customer_phone}`} style={{ display: 'inline-flex', marginTop: '4px' }}>
                    <span className="icon" style={{ fontSize: '0.9rem' }}>call</span>
                    {stop.customer_phone}
                  </a>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <span style={{ fontWeight: 800, fontSize: '0.875rem' }}>{fmtPrice(stop.total_paise)}</span>
                  {isDone && (
                    <div style={{ marginTop: '4px' }}>
                      <span style={{
                        fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em',
                        color: stop.stop_status === 'DELIVERED' ? 'var(--success)' : 'var(--error)',
                      }}>
                        {stop.stop_status}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Items */}
              {stop.items?.length > 0 && (
                <div className="stop-items">
                  <div className="items-chip">
                    {stop.items.map((it, i) => (
                      <span key={i} className="item-tag">
                        {it.product} {it.variant !== '/ ' ? `— ${it.variant}` : ''} × {it.qty}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions — only show for current unlocked pending stop */}
              {isCurrent && (
                <div className="stop-actions">
                  <button
                    className="btn btn-success"
                    style={{ flex: 1, justifyContent: 'center' }}
                    disabled={!!actionLoading}
                    onClick={() => handleDeliver(stop)}
                  >
                    {actionLoading === stop.stop_id ? '…' : <><span className="icon">check_circle</span> Delivered</>}
                  </button>
                  <button
                    className="btn btn-danger"
                    style={{ flex: 1, justifyContent: 'center' }}
                    disabled={!!actionLoading}
                    onClick={() => openFail(stop)}
                  >
                    <span className="icon">cancel</span> Failed
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}

      <div style={{ height: '2rem' }} />

      {/* Fail reason modal */}
      {failModal && (
        <div className="modal-overlay" onClick={() => setFailModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Mark Stop as Failed</h3>
            <p style={{ color: 'var(--muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
              {failModal.customer_name} — {failModal.address_line}
            </p>
            <form onSubmit={handleFail}>
              <div className="field">
                <label>Reason *</label>
                <textarea
                  className="input"
                  value={failReason}
                  onChange={e => setFailReason(e.target.value)}
                  placeholder="e.g. Customer not home, wrong address, gate locked…"
                  required
                />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button type="button" className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setFailModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-danger" style={{ flex: 1, justifyContent: 'center' }} disabled={!!actionLoading}>
                  {actionLoading === failModal.stop_id ? 'Saving…' : 'Confirm Failed'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
