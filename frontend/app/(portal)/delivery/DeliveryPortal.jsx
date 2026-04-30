'use client';
import { useState, useEffect, useCallback } from 'react';
import { deliveryApi, setEmpToken, clearEmpToken, getEmpToken } from '@/lib/api';

/* ═══════════════ STYLES (Scoped for Portal) ═══════════════════════════════ */
const portalCSS = `
.portal-ui { 
  font-family: 'Inter', sans-serif; 
  background-color: var(--surface);
  color: var(--on-surface);
  min-height: 100svh;
}
.portal-ui * { box-sizing: border-box; margin: 0; padding: 0; }
.portal-ui .icon { font-family: 'Material Symbols Rounded', sans-serif; font-style: normal; vertical-align: middle; line-height: 1; }

/* Dark mode overrides for specific screens */
.portal-ui.dark-theme {
  background-color: var(--on-surface);
  color: var(--surface);
}

.portal-ui .wordmark {
  font-family: 'Noto Serif', serif;
  font-weight: 700;
  letter-spacing: -0.02em;
}

/* Custom progress bar for delivery flow */
.progress-container {
  background: var(--surface-high);
  border-radius: 999px;
  height: 4px;
  overflow: hidden;
}
.progress-bar {
  background: var(--primary);
  height: 100%;
  transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Status dots */
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
.animate-slide-up { animation: slideUp 0.3s ease-out forwards; }

@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
.animate-fade-in { animation: fadeIn 0.4s ease-out forwards; }
`;

/* ═══════════════ HELPERS ═══════════════════════════════════════════════════ */
const fmtPrice = (p) => p == null ? '—' : (p/100).toLocaleString('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0});

/* ═══════════════ LOGIN SCREEN ══════════════════════════════════════════════ */
function LoginScreen({ onLogin }) {
  const [empId, setEmpId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const handle = async (e) => {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const res = await deliveryApi.post('/auth/login', { emp_id: empId.trim() });
      setEmpToken(res.data.session_token);
      onLogin({ ...res.data.employee, empId: empId.trim() });
    } catch(err) {
      setError(err.response?.data?.message ?? 'Login failed. Check your EMP ID.');
    } finally { setLoading(false); }
  };
  return (
    <div className="auth-page animate-fade-in" style={{ minHeight: '100svh' }}>
      <div className="auth-card" style={{ border: 'none', background: 'transparent', boxShadow: 'none' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <p className="wordmark" style={{ fontSize: '2rem', color: 'var(--surface)' }}>CURATOR</p>
          <p className="label-caps" style={{ color: 'var(--outline)', marginTop: '0.5rem', letterSpacing: '0.15em' }}>Delivery Partner Portal</p>
        </div>

        <div className="section-card animate-slide-up" style={{ padding: '2rem', background: 'var(--surface-white)' }}>
          <h2 className="wordmark" style={{ fontSize: '1.25rem', marginBottom: '0.5rem', color: 'var(--on-surface)' }}>Good day 👋</h2>
          <p style={{ color: 'var(--on-surface-variant)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>Enter your Employee ID to access your batch.</p>
          
          <form onSubmit={handle}>
            <div style={{ marginBottom: '1.25rem' }}>
              <label className="label-caps" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.65rem' }}>Employee ID</label>
              <input 
                className="input-field input-rounded" 
                value={empId} 
                onChange={e=>setEmpId(e.target.value)} 
                placeholder="EMP-AGR-0001" 
                required 
                autoComplete="off"
                style={{ border: '1px solid var(--outline-variant)' }}
              />
            </div>

            {error && (
              <div style={{ 
                background: 'var(--error-container)', 
                color: 'var(--error)', 
                padding: '0.875rem', 
                borderRadius: 'var(--radius-sm)', 
                fontSize: '0.8125rem', 
                fontWeight: 600, 
                marginBottom: '1.25rem' 
              }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary" style={{ width: '100%', padding: '1rem' }}>
              {loading ? 'Authenticating…' : 'Log In →'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════ BATCH SCREEN ══════════════════════════════════════════════ */
function BatchScreen({ emp, onComplete, onLogout }) {
  const [batch, setBatch] = useState(null);
  const [stops, setStops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [failModal, setFailModal] = useState(null);
  const [failReason, setFailReason] = useState('');
  const [acting, setActing] = useState(null);

  const fetchStops = useCallback(async (batchId) => {
    try {
      const r = await deliveryApi.get(`/batch/${batchId}/stops`);
      setStops(r.data.data ?? []);
    } catch (err) {
      if (err.response?.status === 401) {
        clearEmpToken();
        onLogout();
      } else {
        throw err;
      }
    }
  }, [onLogout]);

  const fetchBatch = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await deliveryApi.get('/batch/active');
      const b = r.data.data;
      setBatch(b);
      if (b) await fetchStops(b.id);
    } catch(err) { 
      if (err.response?.status === 401) {
        clearEmpToken();
        onLogout();
      } else {
        setError(err.response?.data?.message ?? 'Load failed'); 
      }
    }
    finally { setLoading(false); }
  }, [fetchStops]);

  useEffect(() => { fetchBatch(); }, [fetchBatch]);

  const deliver = async (stop) => {
    setActing(stop.stop_id);
    try {
      const r = await deliveryApi.patch(`/stops/${stop.stop_id}/deliver`);
      if (r.data.data?.batch_complete) {
        const d = stops.filter(s=>s.stop_status==='DELIVERED').length+1;
        const f = stops.filter(s=>s.stop_status==='FAILED').length;
        onComplete({delivered:d,failed:f,total:stops.length}); return;
      }
      await fetchStops(batch.id);
    } catch(err) { setError(err.response?.data?.message??'Failed'); }
    finally { setActing(null); }
  };

  const doFail = async (e) => {
    e.preventDefault();
    setActing(failModal.stop_id);
    try {
      const r = await deliveryApi.patch(`/stops/${failModal.stop_id}/fail`, { failure_reason: failReason.trim() });
      setFailModal(null);
      if (r.data.data?.batch_complete) {
        const d = stops.filter(s=>s.stop_status==='DELIVERED').length;
        const f = stops.filter(s=>s.stop_status==='FAILED').length+1;
        onComplete({delivered:d,failed:f,total:stops.length}); return;
      }
      await fetchStops(batch.id);
    } catch(err) { setError(err.response?.data?.message??'Failed'); }
    finally { setActing(null); }
  };

  const handleLogout = () => { clearEmpToken(); onLogout(); };

  const completed = stops.filter(s=>['DELIVERED','FAILED'].includes(s.stop_status)).length;
  const progress  = stops.length > 0 ? (completed/stops.length)*100 : 0;

  const currentStop = stops.find(s=>s.stop_status==='PENDING'&&s.is_unlocked);
  const mapLat = parseFloat(currentStop?.lat);
  const mapLng = parseFloat(currentStop?.lng);
  const hasCoords = !isNaN(mapLat) && !isNaN(mapLng);
  const mapUrl = hasCoords
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${mapLng-0.01},${mapLat-0.01},${mapLng+0.01},${mapLat+0.01}&layer=mapnik&marker=${mapLat},${mapLng}`
    : null;
  const googleMapsUrl = hasCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${mapLat},${mapLng}`
    : null;

  if (loading) return (
    <div style={{ minHeight:'100svh', background:'var(--surface)', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ width:32, height:32, border:'2px solid var(--outline-variant)', borderTopColor:'var(--primary)', borderRadius:'50%', animation:'spin 0.7s linear infinite' }}/>
    </div>
  );

  if (!batch) return (
    <div className="animate-fade-in" style={{ minHeight:'100svh', background:'var(--surface)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', padding:'2rem' }}>
      <span className="icon" style={{ fontSize:'4rem', color: 'var(--outline-variant)', marginBottom:'1.5rem' }}>inventory_2</span>
      <h2 className="wordmark" style={{ fontSize:'1.5rem', marginBottom:'0.75rem' }}>No Active Batch</h2>
      <p style={{ color:'var(--on-surface-variant)', marginBottom:'2.5rem', maxWidth: '260px', lineHeight: 1.6 }}>Your assigned delivery batch hasn't been dispatched yet. Please check back later.</p>
      <button className="btn-secondary" style={{ padding: '0.75rem 2rem' }} onClick={handleLogout}>Sign Out</button>
    </div>
  );

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '4rem' }}>
      {/* Premium Header */}
      <div className="glass-nav" style={{ padding:'1rem 1.25rem', borderBottom:'1px solid var(--outline-variant)', display:'flex', justifyContent:'space-between', alignItems:'center', position:'sticky', top:0, zIndex:100 }}>
        <div>
          <p className="wordmark" style={{ fontSize:'1rem', letterSpacing:'0.05em' }}>CURATOR</p>
          <p className="label-caps" style={{ fontSize:'0.6rem', color: 'var(--outline)' }}>{batch.zone_label} — {emp?.empId}</p>
        </div>
        <button className="btn-ghost" style={{ padding:'0.4rem 0.6rem', fontSize:'0.75rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.25rem' }} onClick={handleLogout}>
          <span className="icon" style={{ fontSize:'1.1rem' }}>logout</span> 
          <span>Sign Out</span>
        </button>
      </div>

      {/* Progress & Stats */}
      <div style={{ background:'var(--surface-white)', padding:'1.25rem', borderBottom: '1px solid var(--outline-variant)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:'0.75rem' }}>
          <p className="label-caps" style={{ fontSize: '0.65rem' }}>Batch Progress</p>
          <p style={{ fontWeight:700, fontSize:'0.8125rem', color:'var(--primary)' }}>{completed} of {stops.length} stops</p>
        </div>
        <div className="progress-container">
          <div className="progress-bar" style={{ width:`${progress}%` }}/>
        </div>
      </div>

      {error && (
        <div style={{ background:'var(--error-container)', color:'var(--error)', padding:'0.75rem 1.25rem', fontWeight:600, fontSize:'0.8125rem' }}>
          {error}
        </div>
      )}

      {/* Map View (Focused on current stop) */}
      {mapUrl && (
        <div className="animate-slide-up" style={{ margin:'1.25rem', borderRadius:'var(--radius-md)', overflow:'hidden', border: '1px solid var(--outline-variant)', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
          <iframe title="map" src={mapUrl} style={{ width:'100%', height:220, border:'none', filter: 'grayscale(0.2) contrast(1.1)' }}/>
          {googleMapsUrl && (
            <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" style={{ display:'block', padding:'0.75rem', background:'var(--primary)', color:'#fff', textAlign:'center', fontWeight:700, fontSize:'0.875rem', textDecoration:'none' }}>
              <span style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'0.5rem' }}>
                <span className="icon">navigation</span>
                Navigate with Google Maps
              </span>
            </a>
          )}
        </div>
      )}

      {/* Stops List */}
      <div style={{ padding: '0 1.25rem' }}>
        {stops.map(stop => {
          const done   = ['DELIVERED','FAILED'].includes(stop.stop_status);
          const locked = !stop.is_unlocked;
          const curr   = stop.stop_status === 'PENDING' && stop.is_unlocked;
          
          return (
            <div key={stop.stop_id} className="section-card animate-slide-up" style={{ 
              padding: '1rem',
              opacity: locked ? 0.4 : 1,
              filter: locked ? 'grayscale(1)' : 'none',
              border: curr ? '1px solid var(--primary)' : '1px solid var(--outline-variant)',
              boxShadow: curr ? '0 4px 20px rgba(46,91,255,0.1)' : '0 1px 3px rgba(0,0,0,0.02)'
            }}>
              <div style={{ display:'flex', gap:'1rem', alignItems:'flex-start' }}>
                <div style={{ 
                  width:24, height:24, borderRadius:'50%', 
                  background: done ? (stop.stop_status==='DELIVERED'?'#10B981':'var(--error)') : (locked ? 'var(--outline-variant)' : 'var(--on-surface)'), 
                  color:'#fff', fontWeight:800, fontSize:'0.75rem', 
                  display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 
                }}>
                  {stop.stop_number}
                </div>
                
                <div style={{ flex:1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <p style={{ fontWeight:700, fontSize:'0.9375rem', color: 'var(--on-surface)' }}>{stop.customer_name}</p>
                    <p style={{ fontWeight:800, fontSize:'0.875rem', whiteSpace: 'nowrap' }}>{fmtPrice(stop.total_paise)}</p>
                  </div>
                  
                  <p style={{ color:'var(--on-surface-variant)', fontSize:'0.8125rem', marginTop: 4, lineHeight: 1.4 }}>
                    {stop.address_line}{stop.landmark ? ` • ${stop.landmark}` : ''}
                  </p>
                  
                  <div style={{ display: 'flex', gap: '1rem', marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <a href={`tel:${stop.customer_phone}`} style={{ display:'inline-flex', alignItems:'center', gap:4, color:'var(--primary)', fontWeight:700, fontSize:'0.75rem', textDecoration:'none' }}>
                      <span className="icon" style={{ fontSize:'1rem' }}>call</span>
                      {stop.customer_phone}
                    </a>
                    
                    {curr && (() => {
                      const lat = parseFloat(stop.lat);
                      const lng = parseFloat(stop.lng);
                      const hasCoords = !isNaN(lat) && !isNaN(lng);
                      const fullAddress = [stop.address_line, stop.landmark].filter(Boolean).join(', ');
                      const navUrl = hasCoords 
                        ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
                        : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fullAddress)}`;
                      return (
                        <a href={navUrl} target="_blank" rel="noopener noreferrer" style={{ display:'inline-flex', alignItems:'center', gap:4, color:'#10B981', fontWeight:700, fontSize:'0.75rem', textDecoration:'none' }}>
                          <span className="icon" style={{ fontSize:'1rem' }}>navigation</span>
                          Navigate
                        </a>
                      );
                    })()}
                    
                    {done && (
                      <div className="status-badge" style={{ 
                        color: stop.stop_status==='DELIVERED'?'#059669':'var(--error)', 
                        borderColor: 'currentColor', 
                        fontSize: '0.6rem',
                        padding: '0.1rem 0.4rem'
                      }}>
                        {stop.stop_status}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {stop.items?.length > 0 && (
                <div style={{ marginTop: '0.875rem', padding: '0.75rem', background: 'var(--surface)', borderRadius: 'var(--radius-sm)', display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                  {stop.items.map((it, i) => (
                    <span key={i} style={{ fontSize:'0.7rem', color: 'var(--on-surface-variant)', fontWeight: 600 }}>
                      {it.product}{it.variant && it.variant !== '/ ' ? ` (${it.variant.trim()})` : ''} ×{it.qty}
                      {i < stop.items.length - 1 ? ' • ' : ''}
                    </span>
                  ))}
                </div>
              )}

              {curr && (
                <div style={{ marginTop: '1rem', display: 'flex', gap: '0.625rem' }}>
                  <button className="btn-primary" style={{ flex:2, padding: '0.75rem', fontSize: '0.875rem' }} disabled={!!acting} onClick={()=>deliver(stop)}>
                    {acting===stop.stop_id ? 'Updating…' : (
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem' }}>
                        <span className="icon">check_circle</span> Delivered
                      </span>
                    )}
                  </button>
                  <button className="btn-secondary" style={{ flex:1, padding: '0.75rem', fontSize: '0.875rem', borderColor: 'var(--error)', color: 'var(--error)' }} disabled={!!acting} onClick={()=>{setFailModal(stop);setFailReason('');}}>
                    <span className="icon">cancel</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Fail Modal - Drawer Style */}
      {failModal && (
        <div className="animate-fade-in" style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(4px)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:500 }}>
          <div className="animate-slide-up" style={{ background:'var(--surface-white)', borderRadius:'24px 24px 0 0', padding:'2rem 1.5rem', width:'100%', maxWidth:480 }} onClick={e=>e.stopPropagation()}>
            <div style={{ width: 40, height: 4, background: 'var(--outline-variant)', borderRadius: 2, margin: '0 auto 1.5rem' }} />
            
            <h3 className="wordmark" style={{ fontSize:'1.25rem', marginBottom:'0.5rem' }}>Mark as Failed</h3>
            <p style={{ color:'var(--on-surface-variant)', fontSize:'0.875rem', marginBottom:'1.5rem' }}>{failModal.customer_name} • {failModal.address_line}</p>
            
            <form onSubmit={doFail}>
              <div style={{ marginBottom:'1.5rem' }}>
                <label className="label-caps" style={{ display:'block', marginBottom:'0.5rem' }}>Reason for failure</label>
                <textarea 
                  className="input-field input-rounded"
                  value={failReason} 
                  onChange={e=>setFailReason(e.target.value)} 
                  placeholder="Customer not home, gate locked, refused delivery…" 
                  rows={4} 
                  required
                  style={{ border: '1px solid var(--outline-variant)', resize: 'none' }}
                />
              </div>
              
              <div style={{ display:'flex', gap:'0.75rem' }}>
                <button type="button" className="btn-secondary" style={{ flex:1, padding:'0.875rem' }} onClick={()=>setFailModal(null)}>Cancel</button>
                <button type="submit" className="btn-primary" style={{ flex:2, padding:'0.875rem', background: 'var(--error)', borderColor: 'var(--error)' }} disabled={!!acting}>
                  {acting===failModal.stop_id ? 'Saving…' : 'Confirm Failure'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════ SUMMARY SCREEN ════════════════════════════════════════════ */
function SummaryScreen({ summary, onLogout }) {
  const { delivered=0, failed=0, total=0 } = summary??{};
  const successRate = total > 0 ? Math.round((delivered/total)*100) : 0;

  return (
    <div className="auth-page animate-fade-in" style={{ minHeight:'100svh', flexDirection: 'column' }}>
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <p style={{ fontSize:'4rem', marginBottom:'1.5rem' }}>🎉</p>
        <h1 className="wordmark" style={{ fontSize:'2.25rem', color: 'var(--surface)', marginBottom:'0.5rem' }}>Batch Complete!</h1>
        <p style={{ color:'var(--outline)', fontSize: '0.9375rem' }}>Outstanding work. All stops have been handled.</p>
      </div>

      <div style={{ 
        display:'grid', 
        gridTemplateColumns:'1fr 1fr', 
        gap:'1rem', 
        width:'100%', 
        maxWidth:420, 
        marginBottom:'3rem' 
      }}>
        {[
          { v: delivered, l: 'Delivered', c: '#10B981', i: 'check_circle' },
          { v: failed, l: 'Failed', c: 'var(--error)', i: 'cancel' },
          { v: total, l: 'Total Stops', c: 'var(--surface)', i: 'inventory_2' },
          { v: `${successRate}%`, l: 'Success Rate', c: 'var(--primary)', i: 'trending_up' }
        ].map((s, idx) => (
          <div key={idx} className="section-card animate-slide-up" style={{ 
            background:'rgba(255,255,255,0.05)', 
            border: '1px solid rgba(255,255,255,0.1)',
            padding:'1.25rem',
            textAlign: 'center',
            animationDelay: `${idx * 0.1}s`
          }}>
            <span className="icon" style={{ color: 'rgba(255,255,255,0.3)', fontSize: '1.25rem', display: 'block', marginBottom: '0.5rem' }}>{s.i}</span>
            <p className="wordmark" style={{ fontSize:'1.75rem', color: s.c }}>{s.v}</p>
            <p className="label-caps" style={{ fontSize:'0.6rem', color:'var(--outline)', marginTop:4 }}>{s.l}</p>
          </div>
        ))}
      </div>

      <button className="btn-primary animate-slide-up" style={{ padding:'1rem 3rem', animationDelay: '0.4s' }} onClick={()=>{clearEmpToken();onLogout();}}>
        Sign Out & Close
      </button>
    </div>
  );
}

/* ═══════════════ ROOT ══════════════════════════════════════════════════════ */
export default function DeliveryPortal() {
  const [screen, setScreen] = useState('login');
  const [emp, setEmp] = useState(null);
  const [summary, setSummary] = useState(null);

  // Check if token already exists (resume session)
  useEffect(() => {
    const t = getEmpToken();
    if (!t) return;
    setScreen('batch');
    deliveryApi.get('/batch/active')
      .then((res) => {
        const batch = res.data?.data;
        if (batch?.emp_id) {
          setEmp({ empId: String(batch.emp_id) });
        }
      })
      .catch(() => {
        clearEmpToken();
        setEmp(null);
        setScreen('login');
      });
  }, []);

  return (
    <>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} ${portalCSS}`}</style>
      <div className={`portal-ui ${['login', 'summary'].includes(screen) ? 'dark-theme' : ''}`}>
        {screen==='login'  && <LoginScreen onLogin={(e)=>{setEmp(e);setScreen('batch');}}/>}
        {screen==='batch'  && <BatchScreen emp={emp} onComplete={(s)=>{setSummary(s);setScreen('summary');}} onLogout={()=>{setEmp(null);setScreen('login');}}/>}
        {screen==='summary'&& <SummaryScreen summary={summary} onLogout={()=>{setEmp(null);setSummary(null);setScreen('login');}}/>}
      </div>
    </>
  );
}
