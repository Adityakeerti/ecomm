'use client';
import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import '../admin.css';
import { adminApi, api, setAdminToken, clearAdminToken, getAdminToken, setAdminInfo, getAdminInfo } from '@/lib/api';
import { fmtPrice, fmtDateTime, toSlug, statusBadgeClass, NAV, PAGE_TITLES } from './adminUtils';

/* ─── Contexts ─── */
const AuthCtx  = createContext(null);
const ToastCtx = createContext(null);
let _toastId = 0;

/* ─── Toast hook ─── */
function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((msg, type = 'success') => {
    const id = ++_toastId;
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-container">
        {toasts.map(t => <div key={t.id} className={`toast-msg ${t.type}`}>{t.msg}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}
const useToast = () => useContext(ToastCtx);

/* ─── Auth Provider ─── */
function AuthProvider({ children }) {
  // Always start with null so SSR and client first-render match exactly.
  // After mount, rehydrate from sessionStorage (client-only).
  const [admin, setAdmin] = useState(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = getAdminInfo();
    const token = getAdminToken();
    if (!stored || !token) {
      setMounted(true);
      return;
    }
    adminApi.get('/overview')
      .then(() => setAdmin(stored))
      .catch(() => {
        clearAdminToken();
        setAdmin(null);
      })
      .finally(() => setMounted(true));
  }, []);

  const login = useCallback(async (username, password) => {
    const res = await adminApi.post('/auth/login', { username, password });
    const { accessToken, admin: a } = res.data;
    const adminInfo = a ?? { username };
    setAdminToken(accessToken);
    setAdminInfo(adminInfo);
    setAdmin(adminInfo);
    return res.data;
  }, []);
  const logout = useCallback(() => { clearAdminToken(); setAdmin(null); }, []);
  return <AuthCtx.Provider value={{ admin, login, logout, setAdmin, mounted }}>{children}</AuthCtx.Provider>;
}

/* ─── Sidebar ─── */

function Sidebar() {
  const { admin, logout } = useContext(AuthCtx);
  const router = useRouter();
  const pathname = usePathname();
  const handleLogout = () => { logout(); router.push('/admin/login'); };
  return (
    <aside className="sidebar">
      <div className="sidebar-brand"><h1>CURATOR</h1><p>Admin Console</p></div>
      <nav className="sidebar-nav">
        {NAV.map(l => (
          <Link key={l.href} href={l.href} className={`nav-item ${pathname === l.href ? 'active' : ''}`}>
            <span className="icon material-symbols-rounded">{l.icon}</span>{l.label}
          </Link>
        ))}
      </nav>
      <div className="sidebar-footer">
      {admin && <p className="signed-in-label">Signed in as {admin.username ?? 'Admin'}</p>}
        <button className="nav-item" onClick={handleLogout}><span className="icon material-symbols-rounded">logout</span>Sign Out</button>
      </div>
    </aside>
  );
}

/* ─── Shell (guarded) ─── */
function AdminShell({ children }) {
  const { admin, mounted } = useContext(AuthCtx);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (mounted && !admin && pathname !== '/admin/login') router.push('/admin/login');
  }, [admin, mounted, pathname, router]);

  // Before mount: render nothing — server and client first-paint are both null.
  // After mount: show shell if authenticated, otherwise null (redirect fires above).
  if (!mounted || !admin) return null;

  const title = PAGE_TITLES[pathname] ?? 'Admin';
  return (
    <div className="shell">
      <Sidebar />
      <div className="main-area">
        <header className="topbar"><h2>{title}</h2></header>
        <div className="page-body">{children}</div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ALL PAGES — exported individually, wrapped by AdminPage
══════════════════════════════════════════════════════════════════════════ */

/* ─── Wrapper (provider + css scope) ─── */
export function AdminPage({ children, noShell }) {
  return (
    <AuthProvider>
      <ToastProvider>
        <div className="admin-ui">
          {noShell ? children : <AdminShell>{children}</AdminShell>}
        </div>
      </ToastProvider>
    </AuthProvider>
  );
}

/* ── Login ── */
export function LoginPage() {
  const { login } = useContext(AuthCtx);
  const toast = useToast();
  const router = useRouter();
  const [form, setForm] = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);
  const handle = async (e) => {
    e.preventDefault(); setLoading(true);
    try { await login(form.username, form.password); router.push('/admin'); }
    catch(err) { toast(err.response?.data?.message || 'Login failed', 'error'); }
    finally { setLoading(false); }
  };
  return (
    <div className="login-wrap">
      <div className="login-card">
        <div style={{ textAlign:'center', marginBottom:'2rem' }}>
          <h1 style={{ fontWeight:800, fontSize:'1.25rem', letterSpacing:'0.2em', color:'var(--adm-primary)' }}>CURATOR</h1>
          <p className="text-muted text-sm" style={{ marginTop:'6px', letterSpacing:'0.05em' }}>Admin Portal</p>
        </div>
        <form onSubmit={handle}>
          <div className="field"><label>Username</label><input className="input" value={form.username} onChange={e=>setForm(f=>({...f,username:e.target.value}))} placeholder="admin" required /></div>
          <div className="field"><label>Password</label><input className="input" type="password" value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} placeholder="••••••••" required /></div>
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ width:'100%', padding:'0.75rem', justifyContent:'center', marginTop:'0.5rem' }}>
            {loading ? 'Signing in…' : 'Sign In →'}
          </button>
        </form>
      </div>
    </div>
  );
}

// helper — for inline styles that ref CSS vars (Next.js SSR compat)
const var_ = (v, fallback) => typeof window !== 'undefined' ? getComputedStyle(document.documentElement).getPropertyValue(v) || fallback : fallback;

/* ── Dashboard ── */
export function DashboardPage() {
  const toast = useToast();
  const [stats, setStats] = useState({
    ordersToday: 0,
    revenueTodayPaise: 0,
    pendingOrders: 0,
    dispatchedOrders: 0,
    dispatchReadyZones: 0,
  });
  const [orders, setOrders] = useState([]);
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([adminApi.get('/overview'), adminApi.get('/orders?limit=5'), adminApi.get('/returns?limit=5&status=REQUESTED')])
      .then(([oRes, ordRes, retRes]) => {
        setStats(oRes.data?.stats ?? {
          ordersToday: 0,
          revenueTodayPaise: 0,
          pendingOrders: 0,
          dispatchedOrders: 0,
          dispatchReadyZones: 0,
        });
        setOrders(ordRes.data.data ?? []);
        setReturns(retRes.data.data ?? []);
      })
      .catch(() => toast('Failed to load dashboard', 'error'))
      .finally(() => setLoading(false));
  }, []);
  if (loading) return <div className="spinner" />;
  return (
    <div>
      <div className="stat-grid">
        {[['Orders Today', stats.ordersToday],['Revenue Today', fmtPrice(stats.revenueTodayPaise), true],['Pending',stats.pendingOrders,'Awaiting dispatch'],['En Route',stats.dispatchedOrders,'Active deliveries'],['Dispatch-Ready Zones',stats.dispatchReadyZones]].map(([lbl,val,sub]) => (
          <div key={lbl} className="stat-card"><div className="label">{lbl}</div><div className="value" style={lbl==='Revenue Today'?{color:'var(--adm-primary)'}:{}}>{val}</div>{sub && typeof sub === 'string' && <div className="sub">{sub}</div>}</div>
        ))}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1.25rem'}}>
        <div className="card"><div className="card-title">Recent Orders</div><div className="table-wrap"><table><thead><tr><th>Order #</th><th>Customer</th><th>Total</th><th>Status</th></tr></thead><tbody>{orders.length===0?<tr><td colSpan={4} className="empty-state">No orders</td></tr>:orders.map(o=><tr key={o.id}><td className="font-mono text-sm" style={{color:'var(--adm-primary)'}}>{o.order_number}</td><td className="text-sm">{o.customer_name}</td><td className="text-sm">{fmtPrice(o.total_paise)}</td><td><span className={statusBadgeClass(o.status)}>{o.status}</span></td></tr>)}</tbody></table></div></div>
        <div className="card"><div className="card-title">Pending Returns</div><div className="table-wrap"><table><thead><tr><th>Return ID</th><th>Order</th><th>Reason</th><th>Status</th></tr></thead><tbody>{returns.length===0?<tr><td colSpan={4} className="empty-state">No pending returns</td></tr>:returns.map(r=><tr key={r.id}><td className="font-mono text-sm" style={{color:'var(--adm-primary)'}}>{r.return_id}</td><td className="text-sm">{r.order_number}</td><td className="text-sm truncate" style={{maxWidth:120}}>{r.reason}</td><td><span className={statusBadgeClass(r.status)}>{r.status}</span></td></tr>)}</tbody></table></div></div>
      </div>
    </div>
  );
}

/* ── Orders ── */
export function OrdersPage() {
  const toast = useToast();
  const [orders,setOrders] = useState([]);
  const [loading,setLoading] = useState(true);
  const [filterStatus,setFilterStatus] = useState('');
  const [searchTerm,setSearchTerm] = useState('');
  const [page,setPage] = useState(1);
  const [pagination,setPagination] = useState(null);
  const [selected,setSelected] = useState(null);
  const [selectedIds,setSelectedIds] = useState([]);
  const [bulkStatus,setBulkStatus] = useState('');
  const [bulkUpdating,setBulkUpdating] = useState(false);
  const [orderStatuses,setOrderStatuses] = useState([]);
  
  useEffect(()=>{
    adminApi.get('/enums/order-statuses').then(r=>setOrderStatuses(r.data.data??[])).catch(()=>{});
  },[]);
  
  const fetch_ = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams({page,limit:20});
    if(filterStatus) p.set('status',filterStatus);
    adminApi.get(`/orders?${p}`).then(r=>{setOrders(r.data.data??[]);setPagination(r.data.pagination); setSelectedIds([]);}).catch(()=>toast('Load failed','error')).finally(()=>setLoading(false));
  },[page,filterStatus]);
  useEffect(()=>{fetch_();},[fetch_]);
  const lowerSearch = searchTerm.trim().toLowerCase();
  const filteredOrders = lowerSearch
    ? orders.filter(o => {
      const hay = `${o.order_number ?? ''} ${o.customer_name ?? ''} ${o.customer_phone ?? ''} ${o.zone_label ?? ''}`.toLowerCase();
      return hay.includes(lowerSearch);
    })
    : orders;
  const allFilteredSelected = filteredOrders.length > 0 && filteredOrders.every(o => selectedIds.includes(o.id));
  const toggleSelectAllFiltered = () => {
    if (filteredOrders.length === 0) return;
    if (allFilteredSelected) {
      const filteredSet = new Set(filteredOrders.map(o => o.id));
      setSelectedIds(prev => prev.filter(id => !filteredSet.has(id)));
      return;
    }
    setSelectedIds(prev => Array.from(new Set([...prev, ...filteredOrders.map(o => o.id)])));
  };
  const toggleOrderSelection = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const bulkUpdateStatus = async () => {
    if (!bulkStatus) {
      toast('Choose a status first', 'error');
      return;
    }
    if (selectedIds.length === 0) {
      toast('Select at least one order', 'error');
      return;
    }
    setBulkUpdating(true);
    try {
      const r = await adminApi.patch('/orders/status/bulk', { order_ids: selectedIds, status: bulkStatus });
      toast(r.data?.message ?? 'Bulk status updated', 'success');
      await fetch_();
      if (selected?.id && selectedIds.includes(selected.id)) {
        setSelected(s => s ? { ...s, status: bulkStatus } : s);
      }
    } catch (err) {
      toast(err.response?.data?.message ?? 'Bulk update failed', 'error');
    } finally {
      setBulkUpdating(false);
    }
  };
  const updateStatus = async (id,status) => {
    try { await adminApi.patch(`/orders/${id}/status`,{status}); toast('Status updated','success'); fetch_(); setSelected(s=>s?{...s,status}:s); }
    catch(err) { toast(err.response?.data?.message??'Update failed','error'); }
  };
  const openDetail = async (o) => {
    try { const r = await adminApi.get(`/orders/${o.id}`); setSelected(r.data.data); }
    catch { toast('Load failed','error'); }
  };
  return(<div>
    <div className="filter-row">
      <select className="input" value={filterStatus} onChange={e=>{setFilterStatus(e.target.value);setPage(1);}}>
        <option value="">All Statuses</option>
        {orderStatuses.map(s=><option key={s} value={s}>{s}</option>)}
      </select>
      <input className="input" value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} placeholder="Filter by order/customer/phone/zone" style={{minWidth:280}} />
      <button className="btn btn-ghost btn-sm" onClick={toggleSelectAllFiltered} disabled={filteredOrders.length===0}>{allFilteredSelected?'Unselect filtered':'Select filtered'}</button>
      <select className="input" value={bulkStatus} onChange={e=>setBulkStatus(e.target.value)}>
        <option value="">Bulk status…</option>
        {orderStatuses.map(s=><option key={s} value={s}>{s}</option>)}
      </select>
      <button className="btn btn-primary btn-sm" disabled={bulkUpdating||selectedIds.length===0||!bulkStatus} onClick={bulkUpdateStatus}>
        {bulkUpdating ? 'Updating…' : `Update ${selectedIds.length} order(s)`}
      </button>
      <button className="btn btn-ghost btn-sm" onClick={fetch_}><span className="icon material-symbols-rounded">refresh</span></button>
    </div>
    {loading?<div className="spinner"/>:(
      <div className="card">
        <div className="table-wrap"><table><thead><tr><th><input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAllFiltered} /></th><th>Order #</th><th>Customer</th><th>Phone</th><th>Total</th><th>Zone</th><th>Status</th><th>Payment</th><th>Date</th><th></th></tr></thead>
        <tbody>{filteredOrders.length===0?<tr><td colSpan={10} className="empty-state">No orders.</td></tr>:filteredOrders.map(o=>(
          <tr key={o.id}>
            <td><input type="checkbox" checked={selectedIds.includes(o.id)} onChange={()=>toggleOrderSelection(o.id)} /></td>
            <td className="font-mono text-sm" style={{color:'var(--adm-primary)'}}>{o.order_number}</td>
            <td className="text-sm">{o.customer_name}</td>
            <td className="text-sm text-muted">{o.customer_phone}</td>
            <td className="text-sm" style={{fontWeight:700}}>{fmtPrice(o.total_paise)}</td>
            <td className="text-sm">{o.zone_label??'—'}</td>
            <td><span className={statusBadgeClass(o.status)}>{o.status}</span></td>
            <td><span className={statusBadgeClass(o.payment_status)}>{o.payment_status}</span></td>
            <td className="text-xs text-muted">{fmtDateTime(o.created_at)}</td>
            <td><button className="btn btn-ghost btn-sm" onClick={()=>openDetail(o)}><span className="icon material-symbols-rounded">open_in_new</span></button></td>
          </tr>
        ))}</tbody></table></div>
        {pagination&&pagination.pages>1&&<div className="flex gap-2 items-center mt-4" style={{justifyContent:'center'}}>
          <button className="btn btn-ghost btn-sm" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>← Prev</button>
          <span className="text-sm text-muted">Page {pagination.page} of {pagination.pages}</span>
          <button className="btn btn-ghost btn-sm" disabled={page>=pagination.pages} onClick={()=>setPage(p=>p+1)}>Next →</button>
        </div>}
      </div>
    )}
    {selected&&<div className="modal-overlay" onClick={()=>setSelected(null)}><div className="modal" onClick={e=>e.stopPropagation()}>
      <div className="modal-title">Order <span className="font-mono" style={{color:'var(--adm-primary)'}}>#{selected.order_number}</span><button className="btn btn-ghost btn-sm" onClick={()=>setSelected(null)}><span className="icon material-symbols-rounded">close</span></button></div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.5rem 1.5rem',marginBottom:'1.25rem'}}>
        {[['Customer',selected.customer_name],['Phone',selected.customer_phone],['Total',fmtPrice(selected.total_paise)],['Date',fmtDateTime(selected.created_at)]].map(([l,v])=><div key={l}><div className="text-xs text-muted">{l}</div><div className="text-sm" style={{fontWeight:600,marginTop:2}}>{v}</div></div>)}
      </div>
      {selected.items?.length>0&&<div className="mb-4"><div className="card-title text-sm">Items</div><div className="table-wrap"><table><thead><tr><th>Product</th><th>SKU</th><th>Qty</th><th>Subtotal</th></tr></thead><tbody>{selected.items.map(i=><tr key={i.id}><td className="text-sm">{i.product_name}</td><td className="text-xs font-mono text-muted">{i.sku}</td><td>{i.quantity}</td><td>{fmtPrice(i.subtotal_paise)}</td></tr>)}</tbody></table></div></div>}
      <div><div className="text-xs text-muted mb-2" style={{textTransform:'uppercase',fontWeight:700,letterSpacing:'0.06em'}}>Update Status</div>
      <div className="pill-toggle">{orderStatuses.map(s=><button key={s} className={`btn btn-sm ${selected.status===s?'btn-primary':'btn-ghost'}`} onClick={()=>updateStatus(selected.id,s)}>{s}</button>)}</div></div>
    </div></div>}
  </div>);
}

/* ── Products ── */
const EP  = {name:'',slug:'',description:'',base_price_paise:'',category_id:'',instagram_post_url:''};
const EV  = {sku:'',size:'',colour:'',price_paise:''};
export function ProductsPage() {
  const toast = useToast();
  const [products,setProducts]=useState([]);
  const [categories,setCategories]=useState([]);
  const [loading,setLoading]=useState(true);
  const [modal,setModal]=useState(null);
  const [editProd,setEditProd]=useState(null);
  const [form,setForm]=useState(EP);
  const [priceInr,setPriceInr]=useState('');
  const [varForm,setVarForm]=useState(EV);
  const [imgFile,setImgFile]=useState(null);
  const [saving,setSaving]=useState(false);
  const [varProdId,setVarProdId]=useState(null);
  const [createDefaults,setCreateDefaults]=useState({ create_default_variant:true, default_sku:'', initial_stock:10 });
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  const fetch_ = useCallback(async()=>{
    setLoading(true);
    try{
      const [catRes,prodRes] = await Promise.all([adminApi.get('/categories'), adminApi.get('/products')]);
      setCategories(catRes.data.data??[]);
      setProducts(prodRes.data.data??[]);
    }catch{
      toast('Failed to load products/categories. Is backend running and are you logged in?', 'error');
    }finally{setLoading(false);}
  },[]);
  useEffect(()=>{fetch_();},[fetch_]);
  const fc = e=>setForm(f=>({...f,[e.target.name]:e.target.value}));
  const openCreate=()=>{
    if((categories?.length??0)===0){
      toast('No categories loaded. Start backend + refresh, or create a category first.', 'error');
      return;
    }
    setForm(EP);setPriceInr('');
    setEditProd(null);setImgFile(null);
    setCreateDefaults({ create_default_variant:true, default_sku:'', initial_stock:10 });
    setModal('create');
  };
  const openEdit=(p)=>{
    setEditProd(p);
    // Admin list returns paise. Show ₹ in the input for humans.
    const rupees = p.base_price_paise != null ? String(Math.round(Number(p.base_price_paise)/100)) : '';
    setPriceInr(rupees);
    setForm({name:p.name,slug:p.slug,description:p.description||'',base_price_paise:p.base_price_paise??'',category_id:p.category_id??'',instagram_post_url:p.instagram_post_url||''});
    setImgFile(null);
    setModal('edit');
  };
  const saveProd=async(e)=>{
    e.preventDefault();
    setSaving(true);
    try{
      const fd=new FormData();
      // Send price to backend in paise.
      const rupeesNum = Number(priceInr);
      if(!priceInr || Number.isNaN(rupeesNum) || rupeesNum <= 0){
        toast('Enter a valid price in ₹', 'error');
        setSaving(false);
        return;
      }
      Object.entries(form).forEach(([k,v])=>{if(k!=='base_price_paise' && v!=='')fd.append(k,v);});
      fd.append('base_price_paise', String(Math.round(rupeesNum * 100)));
      if(modal==='create'){
        fd.append('create_default_variant', String(createDefaults.create_default_variant));
        if(createDefaults.default_sku?.trim()) fd.append('default_sku', createDefaults.default_sku.trim());
        fd.append('initial_stock', String(Number(createDefaults.initial_stock ?? 0)));
      }
      if(imgFile) fd.append('image',imgFile);
      modal==='create'
        ? await adminApi.post('/products',fd,{headers:{'Content-Type':'multipart/form-data'}})
        : await adminApi.put(`/products/${editProd.id}`,fd,{headers:{'Content-Type':'multipart/form-data'}});
      toast(modal==='create'?'Product created!':'Product updated!','success');
      setModal(null);
      fetch_();
    }catch(err){
      toast(err.response?.data?.message || err.message || 'Save failed','error');
    }finally{setSaving(false);}
  };
  const toggle=async(p)=>{try{await adminApi.patch(`/products/${p.id}/toggle`);toast(p.is_active?'Deactivated':'Activated','success');fetch_();}catch{toast('Toggle failed','error');}};
  const openVar=(id)=>{setVarProdId(id);setVarForm(EV);setModal('variant');};
  const saveVar=async(e)=>{e.preventDefault();setSaving(true);try{await adminApi.post(`/products/${varProdId}/variants`,{...varForm,price_paise:Number(varForm.price_paise)});toast('Variant added!','success');setModal(null);fetch_();}catch(err){toast(err.response?.data?.message??'Failed','error');}finally{setSaving(false);}};
  return(<div>
    <div className="flex justify-between items-center mb-6"><div/><button className="btn btn-primary" onClick={openCreate}><span className="icon material-symbols-rounded">add</span>New Product</button></div>
    {loading?<div className="spinner"/>:(
      <div className="card"><div className="table-wrap"><table><thead><tr><th>Img</th><th>Name</th><th>Slug</th><th>Price</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>{products.length===0?<tr><td colSpan={6} className="empty-state">No products.</td></tr>:products.map(p=>(
        <tr key={p.slug??p.id}>
          <td>{p.image_url?<img src={p.image_url} alt={p.name} style={{width:36,height:48,objectFit:'cover',borderRadius:4}}/>:<span>👕</span>}</td>
          <td style={{fontWeight:700}}>{p.name}</td>
          <td className="font-mono text-xs text-muted">{p.slug}</td>
          <td className="text-sm" style={{fontWeight:700}}>{fmtPrice(p.base_price_paise)}</td>
          <td><span className={`badge ${p.is_active!==false?'badge-active':'badge-inactive'}`}>{p.is_active!==false?'Active':'Inactive'}</span></td>
          <td><div className="flex gap-2">
            <button className="btn btn-ghost btn-sm" onClick={()=>openEdit(p)}><span className="icon material-symbols-rounded">edit</span></button>
            <button className="btn btn-ghost btn-sm" onClick={()=>openVar(p.id)}><span className="icon material-symbols-rounded">add_circle</span></button>
            <button className="btn btn-ghost btn-sm" onClick={()=>toggle(p)}><span className="icon material-symbols-rounded">{p.is_active!==false?'visibility_off':'visibility'}</span></button>
          </div></td>
        </tr>
      ))}</tbody></table></div></div>
    )}
    {(modal==='create'||modal==='edit')&&<div className="modal-overlay" onClick={()=>setModal(null)}><div className="modal" onClick={e=>e.stopPropagation()}>
      <div className="modal-title">{modal==='create'?'New Product':'Edit Product'}<button className="btn btn-ghost btn-sm" onClick={()=>setModal(null)}><span className="icon material-symbols-rounded">close</span></button></div>
      <form onSubmit={saveProd}>
        <div className="field"><label>Name *</label><input className="input" name="name" value={form.name} onChange={e=>{setForm(f=>({...f,name:e.target.value,slug:toSlug(e.target.value)}));}} required /></div>
        <div className="field"><label>Slug *</label><input className="input" name="slug" value={form.slug} onChange={fc} required /></div>
        <div className="grid-2">
          <div className="field"><label>Price (₹) *</label><input className="input" type="number" min="1" value={priceInr} onChange={e=>setPriceInr(e.target.value)} required /></div>
          <div className="field"><label>Category *</label><select className="input" name="category_id" value={form.category_id} onChange={fc} required><option value="">Select…</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        </div>
        {modal==='create'&&(
          <div style={{background:'var(--adm-bg)',border:`1px solid var(--adm-border)`,borderRadius:'var(--adm-r-lg)',padding:'1rem',marginBottom:'1rem'}}>
            <div className="text-xs text-muted" style={{fontWeight:700,letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:'0.75rem'}}>Storefront visibility</div>
            <div className="field" style={{marginBottom:'0.75rem'}}>
              <label style={{display:'flex',alignItems:'center',gap:'0.5rem',marginBottom:0}}>
                <input type="checkbox" checked={!!createDefaults.create_default_variant} onChange={e=>setCreateDefaults(d=>({...d,create_default_variant:e.target.checked}))}/>
                Create a default variant + inventory
              </label>
            </div>
            {createDefaults.create_default_variant&&(
              <div className="grid-2">
                <div className="field" style={{marginBottom:0}}>
                  <label>Default SKU</label>
                  <input className="input" value={createDefaults.default_sku} onChange={e=>setCreateDefaults(d=>({...d,default_sku:e.target.value}))} placeholder={`${form.slug?form.slug.toUpperCase().replace(/[^A-Z0-9]+/g,'-'):'PRODUCT'}-DEFAULT`}/>
                </div>
                <div className="field" style={{marginBottom:0}}>
                  <label>Initial Stock</label>
                  <input className="input" type="number" min="0" value={createDefaults.initial_stock} onChange={e=>setCreateDefaults(d=>({...d,initial_stock:e.target.value}))}/>
                </div>
              </div>
            )}
            <div className="text-xs text-muted" style={{marginTop:'0.75rem'}}>
              Products appear on the user side only when they have a variant + inventory.
            </div>
          </div>
        )}
        <div className="field"><label>Description</label><textarea className="input" name="description" value={form.description} onChange={fc} rows={3}/></div>
        <div className="field"><label>Instagram URL</label><input className="input" name="instagram_post_url" value={form.instagram_post_url} onChange={fc}/></div>
        <div className="field"><label>Image</label><input type="file" accept="image/*" onChange={e=>setImgFile(e.target.files[0])} style={{fontSize:'0.875rem'}}/></div>
        <div className="flex gap-3 mt-4"><button type="button" className="btn btn-ghost" onClick={()=>setModal(null)}>Cancel</button><button type="submit" disabled={saving} className="btn btn-primary" style={{flex:1,justifyContent:'center'}}>{saving?'Saving…':modal==='create'?'Create':'Save'}</button></div>
      </form>
    </div></div>}
    {modal==='variant'&&<div className="modal-overlay" onClick={()=>setModal(null)}><div className="modal" style={{maxWidth:400}} onClick={e=>e.stopPropagation()}>
      <div className="modal-title">Add Variant<button className="btn btn-ghost btn-sm" onClick={()=>setModal(null)}><span className="icon material-symbols-rounded">close</span></button></div>
      <form onSubmit={saveVar}>
        <div className="grid-2"><div className="field"><label>Size</label><input className="input" name="size" value={varForm.size} onChange={e=>setVarForm(f=>({...f,size:e.target.value}))} placeholder="XL"/></div><div className="field"><label>Colour</label><input className="input" name="colour" value={varForm.colour} onChange={e=>setVarForm(f=>({...f,colour:e.target.value}))} placeholder="Black"/></div></div>
        <div className="field"><label>SKU *</label><input className="input" name="sku" value={varForm.sku} onChange={e=>setVarForm(f=>({...f,sku:e.target.value}))} required/></div>
        <div className="field"><label>Price (paise) *</label><input className="input" name="price_paise" type="number" min="1" value={varForm.price_paise} onChange={e=>setVarForm(f=>({...f,price_paise:e.target.value}))} required/></div>
        <div className="flex gap-3 mt-4"><button type="button" className="btn btn-ghost" onClick={()=>setModal(null)}>Cancel</button><button type="submit" disabled={saving} className="btn btn-primary" style={{flex:1,justifyContent:'center'}}>{saving?'Saving…':'Add Variant'}</button></div>
      </form>
    </div></div>}
  </div>);
}

/* ── Inventory ── */
export function InventoryPage() {
  const toast = useToast();
  const [items,setItems]=useState([]);
  const [loading,setLoading]=useState(true);
  const [restockModal,setRestockModal]=useState(null);
  const [qty,setQty]=useState('');
  const [saving,setSaving]=useState(false);
  const fetch_ = useCallback(()=>{
    setLoading(true);
    api.get('/products').then(r=>{
      const data = r.data || {};
      const rows=[];
      (data.data??data??[]).forEach(p=>{
        (p.variants??[]).forEach(v=>{
          const variantId = v.id ?? v.variant_id; // v_product_listing uses variant_id
          if(!variantId) return;
          rows.push({
            variant_id: variantId,
            sku: v.sku,
            product: p.name,
            size: v.size||'—',
            colour: v.colour||'—',
            quantity: v.quantity??v.available_qty??0,
            reserved: v.reserved??0,
          });
        });
      });
      setItems(rows);
    }).catch(()=>toast('Failed to load inventory list','error')).finally(()=>setLoading(false));
  },[]);
  useEffect(()=>{fetch_();},[fetch_]);
  const restock=async(e)=>{
    e.preventDefault();
    if(!qty||Number(qty)<1) return;
    if(!restockModal?.variantId){ toast('Missing variant id','error'); return; }
    setSaving(true);
    try{
      await adminApi.patch(`/inventory/${restockModal.variantId}/restock`,{quantity_to_add:Number(qty)});
      toast(`Restocked +${qty}`,'success');
      setRestockModal(null);
      setQty('');
      fetch_();
    }catch(err){
      toast(err.response?.data?.message??'Failed','error');
    }finally{setSaving(false);}
  }
  const col=(q)=>q===0?'#DC2626':q<=5?'#D97706':'#059669';
  return(<div>
    {loading?<div className="spinner"/>:<div className="card"><div className="table-wrap"><table><thead><tr><th>Product</th><th>SKU</th><th>Size</th><th>Colour</th><th>Stock</th><th>Reserved</th><th></th></tr></thead>
    <tbody>{items.length===0?<tr><td colSpan={7} className="empty-state">No inventory yet.</td></tr>:items.map(i=>(
      <tr key={i.variant_id}><td style={{fontWeight:600}}>{i.product}</td><td className="font-mono text-xs">{i.sku}</td><td className="text-sm">{i.size}</td><td className="text-sm">{i.colour}</td>
      <td><span style={{fontWeight:800,color:col(i.quantity)}}>{i.quantity}</span></td>
      <td className="text-sm text-muted">{i.reserved}</td>
      <td><button className="btn btn-ghost btn-sm" onClick={()=>{setRestockModal({variantId:i.variant_id,sku:i.sku,current:i.quantity});setQty('');}}><span className="icon material-symbols-rounded">add</span>Restock</button></td></tr>
    ))}</tbody></table></div></div>}
    {restockModal&&<div className="modal-overlay" onClick={()=>setRestockModal(null)}><div className="modal" style={{maxWidth:360}} onClick={e=>e.stopPropagation()}>
      <div className="modal-title">Restock — <span className="font-mono" style={{color:'var(--adm-primary)'}}>{restockModal.sku}</span><button className="btn btn-ghost btn-sm" onClick={()=>setRestockModal(null)}><span className="icon material-symbols-rounded">close</span></button></div>
      <p className="text-sm text-muted mb-4">Current: <strong>{restockModal.current}</strong></p>
      <form onSubmit={restock}><div className="field"><label>Add Qty</label><input className="input" type="number" min="1" value={qty} onChange={e=>setQty(e.target.value)} autoFocus required/></div>
      <div className="flex gap-3"><button type="button" className="btn btn-ghost" onClick={()=>setRestockModal(null)}>Cancel</button><button type="submit" disabled={saving} className="btn btn-primary" style={{flex:1,justifyContent:'center'}}>{saving?'Saving…':'Add Stock'}</button></div></form>
    </div></div>}
  </div>);
}

/* ── Dispatch ── */
export function DispatchPage() {
  const toast = useToast();
  const [zones,setZones]=useState([]);
  const [dispatchedOrders,setDispatchedOrders]=useState([]);
  const [loading,setLoading]=useState(true);
  const [dispatching,setDispatching]=useState(null);
  const fetch_=useCallback(()=>{
    setLoading(true);
    Promise.all([
      adminApi.get('/dispatch/ready'),
      adminApi.get('/dispatch/dispatched-orders?limit=50')
    ])
      .then(([readyRes, dispatchedRes]) => {
        setZones(readyRes.data.data ?? []);
        setDispatchedOrders(dispatchedRes.data.data ?? []);
      })
      .catch(()=>toast('Load failed','error'))
      .finally(()=>setLoading(false));
  },[]);
  useEffect(()=>{fetch_();},[fetch_]);
  const assign=async(batchId,empId)=>{try{await adminApi.post(`/dispatch/batches/${batchId}/assign`,{emp_id:empId});toast('Employee assigned!','success');fetch_();}catch(err){toast(err.response?.data?.message??'Failed','error');}};
  const dispatch=async(batchId)=>{setDispatching(batchId);try{const r=await adminApi.post(`/dispatch/batches/${batchId}/dispatch`);toast(`Dispatched ${r.data.data?.stop_count} stops!`,'success');fetch_();}catch(err){toast(err.response?.data?.message??'Failed','error');}finally{setDispatching(null);}}

  function ZoneRow({z}){
    const [empId,setEmpId]=useState('');
    // assigned: true if backend confirmed an employee is assigned (from view or after assign call)
    const [assigned,setAssigned]=useState(!!z.emp_id);
    useEffect(()=>{ setAssigned(!!z.emp_id); },[z.emp_id]);
    const doAssign=async()=>{
      if(!empId.trim()) return;
      try{
        await assign(z.batch_id,empId.trim());
        setAssigned(true);
      }catch{}
    };
    return(<tr>
      <td style={{fontWeight:700}}>{z.zone_label}</td>
      <td className="text-sm">{z.pending_order_count??'—'}</td>
      <td className="font-mono text-xs" style={{color:'var(--adm-primary)'}}>{z.batch_id?.slice(-8)}</td>
      <td><span className={statusBadgeClass(z.batch_status??'READY')}>{z.batch_status??'READY'}</span></td>
      <td>{z.batch_status==='DISPATCHED'?<span className="text-sm text-muted">Dispatched ✓</span>:(
        <div className="flex gap-2 items-center">
          <input className="input" style={{width:140}} value={empId} onChange={e=>setEmpId(e.target.value)} placeholder="e.g. EMP001"/>
          <button className="btn btn-ghost btn-sm" disabled={!empId.trim()} onClick={doAssign}>Assign</button>
          <button className="btn btn-primary btn-sm" disabled={dispatching===z.batch_id||!assigned} onClick={()=>dispatch(z.batch_id)}>{dispatching===z.batch_id?'…':'→ Dispatch'}</button>
        </div>
      )}</td>
    </tr>);
  }

  return(<div>
    <div className="flex justify-between items-center mb-4">
      <p className="text-sm text-muted">Zones meeting dispatch threshold</p>
      <button className="btn btn-ghost btn-sm" onClick={fetch_}><span className="icon material-symbols-rounded">refresh</span></button>
    </div>
    {loading ? <div className="spinner"/> : (
      <>
        {zones.length===0 ? (
          <div className="card"><div className="empty-state">📦 No zones ready for dispatch yet.</div></div>
        ) : (
          <div className="card">
            <div className="card-title">Dispatch-Ready Zones</div>
            <div className="table-wrap"><table><thead><tr><th>Zone</th><th>Pending Orders</th><th>Batch ID</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>{zones.map(z=><ZoneRow key={z.batch_id??z.zone_id} z={z}/>)}</tbody></table></div>
          </div>
        )}

        <div className="card" style={{ marginTop:'1rem' }}>
          <div className="card-title">Already Dispatched Orders</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Order #</th><th>Customer</th><th>Zone</th><th>Total</th><th>Payment</th><th>Batch</th><th>Date</th></tr>
              </thead>
              <tbody>
                {dispatchedOrders.length===0 ? (
                  <tr><td colSpan={7} className="empty-state">No dispatched orders found.</td></tr>
                ) : dispatchedOrders.map(o => (
                  <tr key={o.id}>
                    <td className="font-mono text-sm" style={{color:'var(--adm-primary)'}}>{o.order_number}</td>
                    <td className="text-sm">{o.customer_name ?? '—'}</td>
                    <td className="text-sm">{o.zone_label ?? '—'}</td>
                    <td className="text-sm" style={{fontWeight:700}}>{fmtPrice(o.total_paise)}</td>
                    <td><span className={statusBadgeClass(o.payment_status)}>{o.payment_status}</span></td>
                    <td className="font-mono text-xs">{o.batch_id ? o.batch_id.slice(-8) : 'MANUAL'}</td>
                    <td className="text-xs text-muted">{fmtDateTime(o.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>
    )}
  </div>);
}

/* ── Returns ── */
export function ReturnsPage(){
  const toast=useToast();
  const [returns,setReturns]=useState([]);
  const [loading,setLoading]=useState(true);
  const [filterStatus,setFilterStatus]=useState('');
  const [page,setPage]=useState(1);
  const [pagination,setPagination]=useState(null);
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({status:'',admin_notes:'',refund_ref:''});
  const [saving,setSaving]=useState(false);
  const [returnStatuses,setReturnStatuses]=useState([]);
  
  useEffect(()=>{
    adminApi.get('/enums/return-statuses').then(r=>setReturnStatuses(r.data.data??[])).catch(()=>{});
  },[]);
  
  const fetch_=useCallback(()=>{setLoading(true);const p=new URLSearchParams({page,limit:20});if(filterStatus)p.set('status',filterStatus);adminApi.get(`/returns?${p}`).then(r=>{setReturns(r.data.data??[]);setPagination(r.data.pagination);}).catch(()=>toast('Load failed','error')).finally(()=>setLoading(false));},[page,filterStatus]);
  useEffect(()=>{fetch_();},[fetch_]);
  const openAction=(r)=>{setModal(r);setForm({status:r.status,admin_notes:r.admin_notes??'',refund_ref:r.refund_ref??''});};
  const update=async(e)=>{e.preventDefault();setSaving(true);try{await adminApi.patch(`/returns/${modal.id}`,form);toast('Updated!','success');setModal(null);fetch_();}catch(err){toast(err.response?.data?.message??'Failed','error');}finally{setSaving(false);}};
  return(<div>
    <div className="filter-row">
      <select className="input" value={filterStatus} onChange={e=>{setFilterStatus(e.target.value);setPage(1);}}>
        <option value="">All Statuses</option>
        {returnStatuses.map(s=><option key={s} value={s}>{s}</option>)}
      </select>
      <button className="btn btn-ghost btn-sm" onClick={fetch_}><span className="icon material-symbols-rounded">refresh</span></button>
    </div>
    {loading?<div className="spinner"/>:<div className="card"><div className="table-wrap"><table><thead><tr><th>Return ID</th><th>Order</th><th>Customer</th><th>Reason</th><th>Amount</th><th>Status</th><th>Date</th><th></th></tr></thead>
    <tbody>{returns.length===0?<tr><td colSpan={8} className="empty-state">No returns.</td></tr>:returns.map(r=>(
      <tr key={r.id}><td className="font-mono text-sm" style={{color:'var(--adm-primary)'}}>{r.return_id}</td><td className="font-mono text-sm">{r.order_number}</td><td className="text-sm">{r.customer_name}</td><td className="text-sm truncate" style={{maxWidth:180}}>{r.reason}</td><td style={{fontWeight:700}}>{fmtPrice(r.total_paise)}</td><td><span className={statusBadgeClass(r.status)}>{r.status}</span></td><td className="text-xs text-muted">{fmtDateTime(r.requested_at)}</td><td><button className="btn btn-ghost btn-sm" onClick={()=>openAction(r)}><span className="icon material-symbols-rounded">edit</span></button></td>
    </tr>))}</tbody></table></div>
    {pagination&&pagination.pages>1&&<div className="flex gap-2 items-center mt-4" style={{justifyContent:'center'}}><button className="btn btn-ghost btn-sm" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>← Prev</button><span className="text-sm text-muted">Page {pagination.page} of {pagination.pages}</span><button className="btn btn-ghost btn-sm" disabled={page>=pagination.pages} onClick={()=>setPage(p=>p+1)}>Next →</button></div>}
    </div>}
    {modal&&<div className="modal-overlay" onClick={()=>setModal(null)}><div className="modal" onClick={e=>e.stopPropagation()}>
      <div className="modal-title">Return {modal.return_id}<button className="btn btn-ghost btn-sm" onClick={()=>setModal(null)}><span className="icon material-symbols-rounded">close</span></button></div>
      <div style={{background:'var(--adm-surface)',borderRadius:'var(--adm-r)',padding:'0.75rem',marginBottom:'1rem'}}><p className="text-sm" style={{fontWeight:600}}>{modal.customer_name}</p><p className="text-sm text-muted">{modal.reason}</p></div>
      <form onSubmit={update}>
        <div className="field"><label>Status</label><select className="input" value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>{returnStatuses.map(s=><option key={s} value={s}>{s}</option>)}</select></div>
        <div className="field"><label>Notes</label><textarea className="input" value={form.admin_notes} onChange={e=>setForm(f=>({...f,admin_notes:e.target.value}))} rows={2}/></div>
        {form.status==='REFUNDED'&&<div className="field"><label>Refund Ref *</label><input className="input" value={form.refund_ref} onChange={e=>setForm(f=>({...f,refund_ref:e.target.value}))} required/></div>}
        <div className="flex gap-3"><button type="button" className="btn btn-ghost" onClick={()=>setModal(null)}>Cancel</button><button type="submit" disabled={saving} className="btn btn-primary" style={{flex:1,justifyContent:'center'}}>{saving?'Saving…':'Update'}</button></div>
      </form>
    </div></div>}
  </div>);
}

/* ── Leaflet Map Zone Picker (no API key required) ── */
function ZoneMapModal({form,setForm,saving,onClose,onSave}){
  const mapDivRef=useRef(null);
  const mapRef=useRef(null);
  const markerRef=useRef(null);
  const circleRef=useRef(null);
  const [mapError,setMapError]=useState(null);
  // State/city selector
  const [selState,setSelState]=useState('');
  const [citiesList,setCitiesList]=useState([]);
  const [loadingCities,setLoadingCities]=useState(false);
  const [cityPickerError,setCityPickerError]=useState('');
  const fc=e=>setForm(f=>({...f,[e.target.name]:e.target.value}));
  const onStateChange=async name=>{
    setSelState(name);setCitiesList([]);setCityPickerError('');
    setForm(f=>({...f,city_name:'',city_state:name}));
    if(!name) return;
    setLoadingCities(true);
    try{
      const r=await fetch('https://countriesnow.space/api/v0.1/countries/state/cities',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({country:'India',state:name})});
      const d=await r.json();
      const list=d.data?.sort()??[];
      if(list.length===0) setCityPickerError('No cities found — type below');
      setCitiesList(list);
    }catch{setCityPickerError('Could not load cities — type below');}
    finally{setLoadingCities(false);}
  };
  const onCityPick=name=>setForm(f=>({...f,city_name:name,city_state:selState}));

  useEffect(()=>{
    let cancelled=false;

    function initMap(){
      if(cancelled||!mapDivRef.current||mapRef.current) return;
      try{
        const L=window.L;
        const map=L.map(mapDivRef.current).setView([20.5937,78.9629],5);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
          attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom:18,
        }).addTo(map);
        mapRef.current=map;
        map.on('click',e=>{
          if(cancelled) return;
          const lat=e.latlng.lat.toFixed(6);
          const lng=e.latlng.lng.toFixed(6);
          setForm(f=>{
            // redraw marker + circle with current radius_km
            const rad=parseFloat(f.radius_km||5)*1000;
            if(markerRef.current){markerRef.current.remove();}
            if(circleRef.current){circleRef.current.remove();}
            markerRef.current=L.marker([lat,lng]).addTo(map);
            circleRef.current=L.circle([lat,lng],{radius:rad,color:'#6366f1',fillOpacity:0.15,weight:2}).addTo(map);
            return {...f,center_lat:lat,center_lng:lng};
          });
        });
      }catch(err){
        console.error('Leaflet init error',err);
        setMapError('Map failed to load. Enter coordinates manually.');
      }
    }

    // Load Leaflet CSS
    if(!document.getElementById('leaflet-css')){
      const lnk=document.createElement('link');
      lnk.id='leaflet-css';lnk.rel='stylesheet';
      lnk.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(lnk);
    }
    // Load Leaflet JS
    if(window.L){
      initMap();
    } else if(!document.getElementById('leaflet-js')){
      const sc=document.createElement('script');
      sc.id='leaflet-js';
      sc.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      sc.onload=()=>{ if(!cancelled) initMap(); };
      sc.onerror=()=>setMapError('Could not load map. Enter coordinates manually.');
      document.head.appendChild(sc);
    } else {
      // Script tag exists but not yet loaded — poll for window.L
      const poll=setInterval(()=>{ if(window.L){clearInterval(poll);initMap();} },100);
      return ()=>{ cancelled=true; clearInterval(poll); if(mapRef.current){mapRef.current.remove();mapRef.current=null;} };
    }

    return ()=>{
      cancelled=true;
      if(mapRef.current){mapRef.current.remove();mapRef.current=null;}
    };
  },[]);

  // Redraw circle when radius changes
  useEffect(()=>{
    if(!mapRef.current||!form.center_lat||!form.center_lng) return;
    const lat=parseFloat(form.center_lat),lng=parseFloat(form.center_lng);
    if(isNaN(lat)||isNaN(lng)) return;
    if(circleRef.current){circleRef.current.remove();}
    circleRef.current=window.L.circle([lat,lng],{radius:parseFloat(form.radius_km||5)*1000,color:'#6366f1',fillOpacity:0.15,weight:2}).addTo(mapRef.current);
  },[form.radius_km]);

  return(<div className="modal-overlay" onClick={onClose}><div className="modal" style={{maxWidth:680,width:'95vw'}} onClick={e=>e.stopPropagation()}>
    <div className="modal-title">New Zone<button className="btn btn-ghost btn-sm" onClick={onClose}><span className="icon material-symbols-rounded">close</span></button></div>
    <form onSubmit={onSave}>
      <div className="grid-2">
        <div className="field"><label>State *</label><select className="input" value={selState} onChange={e=>onStateChange(e.target.value)} required><option value="">Select state…</option>{INDIA_STATES.map(s=><option key={s} value={s}>{s}</option>)}</select></div>
        <div className="field"><label>City *</label>
          {citiesList.length>0
            ?<select className="input" value={form.city_name??''} onChange={e=>onCityPick(e.target.value)} required disabled={loadingCities}><option value="">Select city…</option>{citiesList.map(c=><option key={c} value={c}>{c}</option>)}</select>
            :<input className="input" value={form.city_name??''} onChange={e=>onCityPick(e.target.value)} placeholder={loadingCities?'Loading…':cityPickerError||'Select a state first'} disabled={!selState||loadingCities} required/>
          }
        </div>
      </div>
      <div className="field"><label>Label *</label><input className="input" name="label" value={form.label} onChange={fc} placeholder="North Zone" required/></div>
      <div className="field">
        <label style={{marginBottom:6}}>📍 Click on the map to set zone centre</label>
        {mapError
          ? <div style={{padding:'1rem',background:'var(--adm-surface)',borderRadius:'var(--adm-r)',border:'1px solid var(--adm-border)',color:'var(--adm-muted)',fontSize:'0.85rem'}}>{mapError}</div>
          : <div ref={mapDivRef} style={{height:300,borderRadius:'var(--adm-r)',border:'1px solid var(--adm-border)',overflow:'hidden',background:'#e8e8e8',position:'relative',zIndex:0}}><div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',color:'#999',fontSize:'0.85rem',pointerEvents:'none',zIndex:1}}>Loading map…</div></div>
        }
      </div>
      <div className="grid-2">
        <div className="field"><label>Center Lat</label><input className="input" name="center_lat" value={form.center_lat} onChange={fc} placeholder="Click map or type…" required/></div>
        <div className="field"><label>Center Lng</label><input className="input" name="center_lng" value={form.center_lng} onChange={fc} placeholder="Click map or type…" required/></div>
      </div>
      <div className="grid-2">
        <div className="field"><label>Radius (km)</label><input className="input" name="radius_km" type="number" step="0.1" value={form.radius_km} onChange={fc}/></div>
        <div className="field"><label>Min Orders</label><input className="input" name="min_order_count" type="number" value={form.min_order_count} onChange={fc}/></div>
      </div>
      <div className="field"><label>Cutoff Time</label><input className="input" name="cutoff_time" value={form.cutoff_time} onChange={fc} placeholder="14:00"/></div>
      <div className="flex gap-3 mt-4"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button type="submit" disabled={saving} className="btn btn-primary" style={{flex:1,justifyContent:'center'}}>{saving?'Saving…':'Create Zone'}</button></div>
    </form>
  </div></div>);
}

/* ── City Picker — bundled India states + countriesnow.space cities ── */
const INDIA_STATES=['Andaman and Nicobar Islands','Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chandigarh','Chhattisgarh','Dadra and Nagar Haveli and Daman and Diu','Delhi','Goa','Gujarat','Haryana','Himachal Pradesh','Jammu and Kashmir','Jharkhand','Karnataka','Kerala','Ladakh','Lakshadweep','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Puducherry','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal'];
function CityModal({saving,onClose,onSave}){
  const [cities,setCities]=useState([]);
  const [selState,setSelState]=useState('');
  const [selCity,setSelCity]=useState('');
  const [loadingCities,setLoadingCities]=useState(false);
  const [cityError,setCityError]=useState('');
  const onStateChange=async(name)=>{
    setSelState(name);setSelCity('');setCities([]);setCityError('');
    if(!name) return;
    setLoadingCities(true);
    try{
      const r=await fetch('https://countriesnow.space/api/v0.1/countries/state/cities',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({country:'India',state:name})});
      const d=await r.json();
      const list=d.data?.sort()??[];
      if(list.length===0) setCityError('No cities found — type name below');
      setCities(list);
    }catch{setCityError('Could not load cities — type name below');}
    finally{setLoadingCities(false);}
  };
  const handleSave=e=>{e.preventDefault();const city=selCity||document.getElementById('city-manual')?.value;if(selState&&city)onSave({name:city,state:selState,country:'IN'});};
  return(<div className="modal-overlay" onClick={onClose}><div className="modal" style={{maxWidth:400}} onClick={e=>e.stopPropagation()}>
    <div className="modal-title">New City<button className="btn btn-ghost btn-sm" onClick={onClose}><span className="icon material-symbols-rounded">close</span></button></div>
    <form onSubmit={handleSave}>
      <div className="field"><label>State *</label><select className="input" value={selState} onChange={e=>onStateChange(e.target.value)} required><option value="">Select state…</option>{INDIA_STATES.map(s=><option key={s} value={s}>{s}</option>)}</select></div>
      <div className="field"><label>City *</label>
        {cities.length>0
          ? <select className="input" value={selCity} onChange={e=>setSelCity(e.target.value)} required disabled={loadingCities}><option value="">Select city…</option>{cities.map(c=><option key={c} value={c}>{c}</option>)}</select>
          : <input id="city-manual" className="input" placeholder={loadingCities?'Loading cities…':cityError||'Select a state first'} disabled={!selState||loadingCities} required/>
        }
      </div>
      <div className="flex gap-3 mt-4"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button type="submit" disabled={saving||!selState} className="btn btn-primary" style={{flex:1,justifyContent:'center'}}>{saving?'Saving…':'Add City'}</button></div>
    </form>
  </div></div>);
}

/* ── Operations ── */
const OZ={city_name:'',city_state:'',label:'',center_lat:'',center_lng:'',radius_km:'5',min_order_count:'5',cutoff_time:'08:00'};
const OS={full_name:'',phone_number:'',zone_id:''};
const OC={name:'',state:'',country:'IN'};
const OCAT={name:'',slug:''};
export function OperationsPage(){
  const toast=useToast();
  const [tab,setTab]=useState('zones');
  const [zones,setZones]=useState([]);
  const [cities,setCities]=useState([]);
  const [categories,setCategories]=useState([]);
  const [loading,setLoading]=useState(true);
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({});
  const [saving,setSaving]=useState(false);
  const [createdStaff,setCreatedStaff]=useState(null);
  const [staff,setStaff]=useState([]);
  const [confirm,setConfirm]=useState(null); // { title, message, dangerText, resolve }
  const fetch_=useCallback(()=>{
    setLoading(true);
    Promise.all([adminApi.get('/zones'),adminApi.get('/cities'),adminApi.get('/categories'),adminApi.get('/staff')])
      .then(([z,c,cat,s])=>{
        // Show ALL zones (including inactive) so admin can manage them
        setZones(z.data.data??[]);
        // Hide inactive cities/categories/staff by default (soft delete behavior)
        setCities((c.data.data??[]).filter(x=>x.is_active!==false));
        setCategories((cat.data.data??[]).filter(x=>x.is_active!==false));
        setStaff((s.data.data??[]).filter(x=>x.is_active!==false));
      })
      .finally(()=>setLoading(false));
  },[]);
  useEffect(()=>{fetch_();},[fetch_]);
  const fc=e=>setForm(f=>({...f,[e.target.name]:e.target.value}));
  const askConfirm = ({ title, message, dangerText='Delete' }) => new Promise(resolve => setConfirm({ title, message, dangerText, resolve }));
  const saveZone=async(e)=>{
    e.preventDefault();setSaving(true);
    try{
      const cityName=form.city_name?.trim();
      const cityState=form.city_state?.trim();
      if(!cityName||!cityState){toast('Select a state and city','error');setSaving(false);return;}
      let cityId;
      const existing=cities.find(c=>c.name.toLowerCase()===cityName.toLowerCase());
      if(existing){cityId=existing.id;}
      else{const cr=await adminApi.post('/cities',{name:cityName,state:cityState,country:'IN'});cityId=cr.data.data.id;}
      await adminApi.post('/zones',{...form,city_id:cityId});
      toast('Zone created!','success');setModal(null);fetch_();
    }catch(err){toast(err.response?.data?.message||err.response?.data?.detail||'Failed','error');}
    finally{setSaving(false);}
  };
  const toggleZone=async(z)=>{try{await adminApi.patch(`/zones/${z.id}/toggle`);toast(z.is_active?'Deactivated':'Activated','success');fetch_();}catch{toast('Failed','error');}};
  const saveStaff=async(e)=>{e.preventDefault();setSaving(true);try{const r=await adminApi.post('/staff',form);setCreatedStaff(r.data.data);toast(`Created! EMP: ${r.data.data.emp_id}`,'success');fetch_();}catch(err){toast(err.response?.data?.message??'Failed','error');}finally{setSaving(false);}};
  const saveCity=async(data)=>{setSaving(true);try{await adminApi.post('/cities',data);toast('City created!','success');setModal(null);fetch_();}catch(err){toast(err.response?.data?.message??'Failed','error');}finally{setSaving(false);}};  
  const saveCat=async(e)=>{e.preventDefault();setSaving(true);try{await adminApi.post('/categories',form);toast('Category created!','success');setModal(null);fetch_();}catch(err){toast(err.response?.data?.message??'Failed','error');}finally{setSaving(false);}};
  const deleteItem=async(type,id,label)=>{
    const ok = await askConfirm({
      title: `Delete ${label}?`,
      message: `This will remove the ${label}. If it is linked to existing orders/batches, it will be deactivated instead.`,
      dangerText: 'Delete',
    });
    if(!ok) return;
    try{
      const r = await adminApi.delete(`/${type}/${id}`);
      toast(r.data?.message || 'Deleted successfully','success');
      fetch_();
    }catch(err){
      toast(err.response?.data?.message || 'Failed to delete','error');
    }
  };
  return(<div>
    <div className="flex gap-2 mb-4">{[['zones','Zones'],['cities','Cities'],['categories','Categories'],['staff','Delivery Staff']].map(([k,l])=><button key={k} className={`btn btn-sm ${tab===k?'btn-primary':'btn-ghost'}`} onClick={()=>setTab(k)}>{l}</button>)}</div>
    {loading?<div className="spinner"/>:<>
      {tab==='zones'&&<><div className="flex justify-between items-center mb-4"><p className="text-sm text-muted">{zones.length} zones</p><button className="btn btn-primary btn-sm" onClick={()=>{setForm(OZ);setModal('zone');}}><span className="icon material-symbols-rounded">add</span>New Zone</button></div>
        <div className="card"><div className="table-wrap"><table><thead><tr><th>Label</th><th>City</th><th>Radius</th><th>Min Orders</th><th>Cutoff</th><th>Status</th><th></th></tr></thead><tbody>{zones.map(z=><tr key={z.id}><td style={{fontWeight:700}}>{z.label}</td><td>{z.city_name}</td><td>{z.radius_km}km</td><td>{z.min_order_count}</td><td>{z.cutoff_time}</td><td><span className={`badge ${z.is_active?'badge-active':'badge-inactive'}`}>{z.is_active?'Active':'Inactive'}</span></td><td><div className="flex gap-1"><button className="btn btn-ghost btn-sm" onClick={()=>toggleZone(z)}><span className="icon material-symbols-rounded">{z.is_active?'toggle_on':'toggle_off'}</span></button><button className="btn btn-ghost btn-sm text-red-500" onClick={()=>deleteItem('zones',z.id,'zone')}><span className="icon material-symbols-rounded">delete</span></button></div></td></tr>)}</tbody></table></div></div></>}
      {tab==='cities'&&<><div className="flex justify-between items-center mb-4"><p className="text-sm text-muted">{cities.length} cities</p><button className="btn btn-primary btn-sm" onClick={()=>{setForm(OC);setModal('city');}}><span className="icon material-symbols-rounded">add</span>New City</button></div>
        <div className="card"><div className="table-wrap"><table><thead><tr><th>Name</th><th>State</th><th>Country</th><th></th></tr></thead><tbody>{cities.map(c=><tr key={c.id}><td style={{fontWeight:600}}>{c.name}</td><td>{c.state}</td><td>{c.country}</td><td style={{textAlign:'right'}}><button className="btn btn-ghost btn-sm text-red-500" onClick={()=>deleteItem('cities',c.id,'city')}><span className="icon material-symbols-rounded">delete</span></button></td></tr>)}</tbody></table></div></div></>}
      {tab==='categories'&&<><div className="flex justify-between items-center mb-4"><p className="text-sm text-muted">{categories.length} categories</p><button className="btn btn-primary btn-sm" onClick={()=>{setForm(OCAT);setModal('cat');}}><span className="icon material-symbols-rounded">add</span>New Category</button></div>
        <div className="card"><div className="table-wrap"><table><thead><tr><th>Name</th><th>Slug</th><th></th></tr></thead><tbody>{categories.map(c=><tr key={c.id}><td style={{fontWeight:600}}>{c.name}</td><td className="font-mono text-sm">{c.slug}</td><td style={{textAlign:'right'}}><button className="btn btn-ghost btn-sm text-red-500" onClick={()=>deleteItem('categories',c.id,'category')}><span className="icon material-symbols-rounded">delete</span></button></td></tr>)}</tbody></table></div></div></>}
      {tab==='staff'&&<><div className="flex justify-between items-center mb-4"><p className="text-sm text-muted">{staff.length} staff</p><button className="btn btn-primary btn-sm" onClick={()=>{setForm(OS);setCreatedStaff(null);setModal('staff');}}><span className="icon material-symbols-rounded">add</span>New Staff</button></div>
        <div className="card"><div className="table-wrap"><table><thead><tr><th>EMP ID</th><th>Name</th><th>Phone</th><th>Zone</th><th>City</th><th>Status</th><th></th></tr></thead><tbody>{staff.map(s=><tr key={s.id}><td style={{fontFamily:'monospace',fontWeight:700}}>{s.emp_id}</td><td>{s.full_name}</td><td>{s.phone_number}</td><td>{s.zone_label??'—'}</td><td>{s.city_name??'—'}</td><td><span className={`badge ${s.is_active?'badge-active':'badge-inactive'}`}>{s.is_active?'Active':'Inactive'}</span></td><td><div className="flex gap-1"><button className="btn btn-ghost btn-sm" onClick={async()=>{try{await adminApi.patch(`/staff/${s.id}/toggle`);fetch_();}catch{toast('Failed','error');}}}><span className="icon material-symbols-rounded">{s.is_active?'toggle_on':'toggle_off'}</span></button><button className="btn btn-ghost btn-sm text-red-500" onClick={()=>deleteItem('staff',s.id,'staff')}><span className="icon material-symbols-rounded">delete</span></button></div></td></tr>)}{staff.length===0&&<tr><td colSpan={7} style={{textAlign:'center',color:'var(--adm-muted)',padding:'2rem'}}>No delivery staff yet. Create one above.</td></tr>}</tbody></table></div></div></>}
    </>}

    {/* Zone modal */}
    {modal==='zone'&&<ZoneMapModal form={form} setForm={setForm} saving={saving} onClose={()=>setModal(null)} onSave={saveZone}/>}

    {/* Staff modal */}
    {modal==='staff'&&<div className="modal-overlay" onClick={()=>{setModal(null);setCreatedStaff(null);}}><div className="modal" onClick={e=>e.stopPropagation()}>
      <div className="modal-title">New Staff<button className="btn btn-ghost btn-sm" onClick={()=>{setModal(null);setCreatedStaff(null);}}><span className="icon material-symbols-rounded">close</span></button></div>
      {createdStaff?(<div style={{textAlign:'center',padding:'1.5rem 0'}}>
        <div style={{background:'#D1FAE5',borderRadius:8,padding:'1rem',marginBottom:'1.5rem'}}><p style={{fontWeight:800,color:'#065F46'}}>Staff Created!</p><p style={{color:'#065F46',fontSize:'2rem',fontWeight:800,fontFamily:'monospace',marginTop:'0.5rem'}}>{createdStaff.emp_id}</p><p style={{fontSize:'0.8rem',color:'#065F46',opacity:0.7}}>Share this EMP ID with your delivery partner</p></div>
        <button className="btn btn-ghost" onClick={()=>{setModal(null);setCreatedStaff(null);}}>Done</button>
      </div>):(
        <form onSubmit={saveStaff}>
          <div className="field"><label>Full Name *</label><input className="input" name="full_name" value={form.full_name??''} onChange={fc} required/></div>
          <div className="field"><label>Phone * (+91…)</label><input className="input" name="phone_number" value={form.phone_number??''} onChange={fc} placeholder="+919876543210" required/></div>
          <div className="field"><label>Zone *</label><select className="input" name="zone_id" value={form.zone_id??''} onChange={fc} required><option value="">Select zone…</option>{zones.map(z=><option key={z.id} value={z.id}>{z.label}</option>)}</select></div>
          <div className="flex gap-3 mt-4"><button type="button" className="btn btn-ghost" onClick={()=>setModal(null)}>Cancel</button><button type="submit" disabled={saving} className="btn btn-primary" style={{flex:1,justifyContent:'center'}}>{saving?'Creating…':'Create Staff'}</button></div>
        </form>
      )}
    </div></div>}

    {/* City modal */}
    {modal==='city'&&<CityModal saving={saving} onClose={()=>setModal(null)} onSave={saveCity}/>}

    {/* Category modal */}
    {modal==='cat'&&<div className="modal-overlay" onClick={()=>setModal(null)}><div className="modal" style={{maxWidth:360}} onClick={e=>e.stopPropagation()}>
      <div className="modal-title">New Category<button className="btn btn-ghost btn-sm" onClick={()=>setModal(null)}><span className="icon material-symbols-rounded">close</span></button></div>
      <form onSubmit={saveCat}><div className="field"><label>Name *</label><input className="input" name="name" value={form.name??''} onChange={e=>{setForm(f=>({...f,name:e.target.value,slug:e.target.value.toLowerCase().replace(/\s+/g,'-')}))}} required/></div><div className="field"><label>Slug *</label><input className="input" name="slug" value={form.slug??''} onChange={fc} required/></div><div className="flex gap-3 mt-4"><button type="button" className="btn btn-ghost" onClick={()=>setModal(null)}>Cancel</button><button type="submit" disabled={saving} className="btn btn-primary" style={{flex:1,justifyContent:'center'}}>{saving?'Saving…':'Create'}</button></div></form>
    </div></div>}

    {/* Confirm modal (animated) */}
    {confirm&&<div className="modal-overlay" onClick={()=>{confirm.resolve(false);setConfirm(null);}}>
      <div className="modal" style={{maxWidth:420}} onClick={e=>e.stopPropagation()}>
        <div className="modal-title">
          {confirm.title}
          <button className="btn btn-ghost btn-sm" onClick={()=>{confirm.resolve(false);setConfirm(null);}}>
            <span className="icon material-symbols-rounded">close</span>
          </button>
        </div>
        <p className="text-sm text-muted" style={{lineHeight:1.6, marginBottom:'1.25rem'}}>{confirm.message}</p>
        <div className="flex gap-3" style={{justifyContent:'flex-end'}}>
          <button className="btn btn-ghost" onClick={()=>{confirm.resolve(false);setConfirm(null);}}>Cancel</button>
          <button className="btn btn-danger" onClick={()=>{confirm.resolve(true);setConfirm(null);}}>{confirm.dangerText}</button>
        </div>
      </div>
    </div>}
  </div>);
}
