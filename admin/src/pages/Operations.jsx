import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '../lib/api';
import { useToast } from '../contexts/ToastContext';

const EMPTY_ZONE = { city_id: '', label: '', center_lat: '', center_lng: '', radius_km: '5', min_order_count: '5', cutoff_time: '14:00' };
const EMPTY_STAFF = { full_name: '', phone_number: '', zone_id: '' };
const EMPTY_CITY  = { name: '', state: '', country: 'IN' };
const EMPTY_CAT   = { name: '', slug: '' };

export default function Operations() {
  const toast = useToast();
  const [tab, setTab] = useState('zones');
  const [zones, setZones] = useState([]);
  const [cities, setCities] = useState([]);
  const [categories, setCategories] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // 'zone' | 'city' | 'staff' | 'category'
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [createdStaff, setCreatedStaff] = useState(null); // show EMP ID

  const fetchAll = useCallback(() => {
    setLoading(true);
    Promise.all([
      adminApi.get('/zones'),
      adminApi.get('/cities'),
      adminApi.get('/categories'),
    ])
      .then(([zRes, cRes, catRes]) => {
        setZones(zRes.data.data ?? []);
        setCities(cRes.data.data ?? []);
        setCategories(catRes.data.data ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const fieldChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  // ------ Zone ------
  const openZone = () => { setForm(EMPTY_ZONE); setModal('zone'); };

  const saveZone = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await adminApi.post('/zones', form);
      toast('Zone created!', 'success');
      setModal(null);
      fetchAll();
    } catch (err) {
      toast(err.response?.data?.message ?? err.response?.data?.detail ?? 'Zone save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleZone = async (z) => {
    try {
      await adminApi.patch(`/zones/${z.id}/toggle`);
      toast(z.is_active ? 'Zone deactivated' : 'Zone activated', 'success');
      fetchAll();
    } catch {
      toast('Toggle failed', 'error');
    }
  };

  // ------ Staff ------
  const openStaff = () => { setForm(EMPTY_STAFF); setCreatedStaff(null); setModal('staff'); };

  const saveStaff = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await adminApi.post('/staff', form);
      const created = res.data.data;
      setCreatedStaff(created);
      toast(`Staff created! EMP ID: ${created.emp_id}`, 'success');
      fetchAll();
    } catch (err) {
      toast(err.response?.data?.message ?? 'Create failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ------ City ------
  const openCity = () => { setForm(EMPTY_CITY); setModal('city'); };
  const saveCity = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await adminApi.post('/cities', form);
      toast('City created!', 'success');
      setModal(null);
      fetchAll();
    } catch (err) {
      toast(err.response?.data?.message ?? 'City save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ------ Category ------
  const openCat = () => { setForm(EMPTY_CAT); setModal('category'); };
  const saveCat = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await adminApi.post('/categories', form);
      toast('Category created!', 'success');
      setModal(null);
      fetchAll();
    } catch (err) {
      toast(err.response?.data?.message ?? 'Category save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { key: 'zones', label: 'Zones' },
    { key: 'cities', label: 'Cities' },
    { key: 'categories', label: 'Categories' },
    { key: 'staff', label: 'Delivery Staff' },
  ];

  return (
    <div>
      {/* Tab strip */}
      <div className="flex gap-2 mb-4">
        {tabs.map(t => (
          <button
            key={t.key}
            className={`btn btn-sm ${tab === t.key ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? <div className="spinner" /> : (
        <>
          {/* ── Zones ── */}
          {tab === 'zones' && (
            <>
              <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-muted">{zones.length} zone(s)</p>
                <button className="btn btn-primary btn-sm" onClick={openZone}><span className="icon">add</span> New Zone</button>
              </div>
              <div className="card">
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Label</th><th>City</th><th>Radius</th><th>Min Orders</th><th>Cutoff</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                      {zones.map(z => (
                        <tr key={z.id}>
                          <td style={{ fontWeight: 700 }}>{z.label}</td>
                          <td className="text-sm">{z.city_name}</td>
                          <td className="text-sm">{z.radius_km} km</td>
                          <td className="text-sm">{z.min_order_count}</td>
                          <td className="text-sm">{z.cutoff_time}</td>
                          <td><span className={`badge ${z.is_active ? 'badge-active' : 'badge-inactive'}`}>{z.is_active ? 'Active' : 'Inactive'}</span></td>
                          <td>
                            <button className="btn btn-ghost btn-sm" onClick={() => toggleZone(z)}>
                              <span className="icon">{z.is_active ? 'toggle_on' : 'toggle_off'}</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* ── Cities ── */}
          {tab === 'cities' && (
            <>
              <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-muted">{cities.length} city(s)</p>
                <button className="btn btn-primary btn-sm" onClick={openCity}><span className="icon">add</span> New City</button>
              </div>
              <div className="card">
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Name</th><th>State</th><th>Country</th></tr></thead>
                    <tbody>
                      {cities.map(c => (
                        <tr key={c.id}><td style={{ fontWeight: 600 }}>{c.name}</td><td>{c.state}</td><td>{c.country}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* ── Categories ── */}
          {tab === 'categories' && (
            <>
              <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-muted">{categories.length} categories</p>
                <button className="btn btn-primary btn-sm" onClick={openCat}><span className="icon">add</span> New Category</button>
              </div>
              <div className="card">
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Name</th><th>Slug</th></tr></thead>
                    <tbody>
                      {categories.map(c => (
                        <tr key={c.id}><td style={{ fontWeight: 600 }}>{c.name}</td><td className="font-mono text-sm">{c.slug}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* ── Delivery Staff ── */}
          {tab === 'staff' && (
            <>
              <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-muted">Staff with auto-generated EMP IDs</p>
                <button className="btn btn-primary btn-sm" onClick={openStaff}><span className="icon">add</span> New Staff</button>
              </div>
              {/* Fetch staff on demand */}
              <StaffList adminApi={adminApi} zones={zones} toast={toast} key={modal} />
            </>
          )}
        </>
      )}

      {/* ── Zone Modal ── */}
      {modal === 'zone' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">New Delivery Zone<button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}><span className="icon">close</span></button></div>
            <form onSubmit={saveZone}>
              <div className="field"><label>City *</label>
                <select className="input" name="city_id" value={form.city_id} onChange={fieldChange} required>
                  <option value="">Select city…</option>
                  {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="field"><label>Zone Label *</label><input className="input" name="label" value={form.label} onChange={fieldChange} placeholder="Agra North" required /></div>
              <div className="grid-2">
                <div className="field"><label>Center Lat *</label><input className="input" name="center_lat" value={form.center_lat} onChange={fieldChange} placeholder="27.1767" required /></div>
                <div className="field"><label>Center Lng *</label><input className="input" name="center_lng" value={form.center_lng} onChange={fieldChange} placeholder="78.0081" required /></div>
              </div>
              <div className="grid-2">
                <div className="field"><label>Radius (km) *</label><input className="input" name="radius_km" type="number" step="0.1" min="0.1" value={form.radius_km} onChange={fieldChange} required /></div>
                <div className="field"><label>Min Orders</label><input className="input" name="min_order_count" type="number" min="1" value={form.min_order_count} onChange={fieldChange} /></div>
              </div>
              <div className="field"><label>Cutoff Time (HH:MM)</label><input className="input" name="cutoff_time" value={form.cutoff_time} onChange={fieldChange} placeholder="14:00" /></div>
              <div className="flex gap-3 mt-4">
                <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" disabled={saving} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>{saving ? 'Saving…' : 'Create Zone'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Staff Modal ── */}
      {modal === 'staff' && (
        <div className="modal-overlay" onClick={() => { setModal(null); setCreatedStaff(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">New Delivery Staff<button className="btn btn-ghost btn-sm" onClick={() => { setModal(null); setCreatedStaff(null); }}><span className="icon">close</span></button></div>
            {createdStaff ? (
              <div>
                <div style={{ textAlign: 'center', padding: '1rem', background: 'var(--success-bg)', borderRadius: 'var(--radius)', marginBottom: '1.5rem' }}>
                  <p style={{ fontWeight: 800, fontSize: '1.125rem', color: 'var(--success)', marginBottom: '0.25rem' }}>Staff Created!</p>
                  <p className="text-sm text-muted">Share this EMP ID with your delivery partner:</p>
                  <p style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '1.5rem', color: 'var(--primary)', marginTop: '0.5rem' }}>{createdStaff.emp_id}</p>
                </div>
                <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={() => { setModal(null); setCreatedStaff(null); }}>Done</button>
              </div>
            ) : (
              <form onSubmit={saveStaff}>
                <div className="field"><label>Full Name *</label><input className="input" name="full_name" value={form.full_name ?? ''} onChange={fieldChange} placeholder="Ravi Kumar" required /></div>
                <div className="field"><label>Phone *</label><input className="input" name="phone_number" value={form.phone_number ?? ''} onChange={fieldChange} placeholder="+919876543210" required /></div>
                <div className="field"><label>Zone *</label>
                  <select className="input" name="zone_id" value={form.zone_id ?? ''} onChange={fieldChange} required>
                    <option value="">Select zone…</option>
                    {zones.map(z => <option key={z.id} value={z.id}>{z.label}</option>)}
                  </select>
                </div>
                <div className="flex gap-3 mt-4">
                  <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
                  <button type="submit" disabled={saving} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>{saving ? 'Creating…' : 'Create Staff'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── City Modal ── */}
      {modal === 'city' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">New City<button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}><span className="icon">close</span></button></div>
            <form onSubmit={saveCity}>
              <div className="field"><label>City Name *</label><input className="input" name="name" value={form.name ?? ''} onChange={fieldChange} placeholder="Agra" required /></div>
              <div className="field"><label>State *</label><input className="input" name="state" value={form.state ?? ''} onChange={fieldChange} placeholder="Uttar Pradesh" required /></div>
              <div className="field"><label>Country</label><input className="input" name="country" value={form.country ?? 'IN'} onChange={fieldChange} placeholder="IN" /></div>
              <div className="flex gap-3 mt-4">
                <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" disabled={saving} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>{saving ? 'Saving…' : 'Create City'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Category Modal ── */}
      {modal === 'category' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">New Category<button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}><span className="icon">close</span></button></div>
            <form onSubmit={saveCat}>
              <div className="field"><label>Name *</label><input className="input" name="name" value={form.name ?? ''} onChange={e => { setForm(f => ({ ...f, name: e.target.value, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })); }} placeholder="Hoodies" required /></div>
              <div className="field"><label>Slug *</label><input className="input" name="slug" value={form.slug ?? ''} onChange={fieldChange} placeholder="hoodies" required /></div>
              <div className="flex gap-3 mt-4">
                <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" disabled={saving} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>{saving ? 'Saving…' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Lazy staff list (fetches on mount)
function StaffList({ adminApi, zones, toast }) {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // staff endpoint isn't a list, use delivery_zones + staff endpoint workaround
    // Actually there's no GET /admin/staff list endpoint — show zone info instead
    adminApi.get('/zones')
      .then(async (zRes) => {
        const staffRows = [];
        for (const z of (zRes.data.data ?? [])) {
          try {
            const hRes = await adminApi.get(`/staff/1/history`).catch(() => ({ data: { data: { staff: [], history: [] } } }));
          } catch {}
        }
        // Since no list endpoint, note this limitation
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="card">
      <div className="empty-state">
        <p>Staff can only be created (not listed via this API).</p>
        <p className="text-muted text-sm mt-2">Query <code>SELECT * FROM delivery_staff;</code> in your database to see all staff.</p>
      </div>
    </div>
  );
}
