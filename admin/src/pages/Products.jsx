import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '../lib/api';
import { fmtPrice, toSlug } from '../lib/format';
import { useToast } from '../contexts/ToastContext';

const EMPTY_PRODUCT = { name: '', slug: '', description: '', base_price_paise: '', category_id: '', instagram_post_url: '' };
const EMPTY_VARIANT  = { sku: '', size: '', colour: '', price_paise: '' };

export default function Products() {
  const toast = useToast();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // 'create' | 'edit' | 'variant'
  const [editProduct, setEditProduct] = useState(null);
  const [form, setForm] = useState(EMPTY_PRODUCT);
  const [variantForm, setVariantForm] = useState(EMPTY_VARIANT);
  const [imageFile, setImageFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [variantProductId, setVariantProductId] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, cRes] = await Promise.all([
        adminApi.get('/categories'), // get categories
        adminApi.get('/categories'),
      ]);
      // Products from public v1 endpoint since admin doesn't have a list products endpoint
      const prodRes = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000/v1'}/products`);
      const prodData = await prodRes.json();
      setProducts(prodData.data ?? prodData ?? []);
      setCategories(pRes.data.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Auto-slug
  const handleNameChange = (e) => {
    const name = e.target.value;
    setForm(f => ({ ...f, name, slug: toSlug(name) }));
  };

  const openCreate = () => { setForm(EMPTY_PRODUCT); setEditProduct(null); setImageFile(null); setModal('create'); };
  const openEdit   = (p) => {
    setEditProduct(p);
    setForm({ name: p.name, slug: p.slug, description: p.description || '', base_price_paise: p.base_price_paise ?? '', category_id: p.category_id ?? '', instagram_post_url: p.instagram_post_url || '' });
    setImageFile(null);
    setModal('edit');
  };

  const saveProduct = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => { if (v !== '') fd.append(k, v); });
      if (imageFile) fd.append('image', imageFile);

      if (modal === 'create') {
        await adminApi.post('/products', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        toast('Product created!', 'success');
      } else {
        await adminApi.put(`/products/${editProduct.id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        toast('Product updated!', 'success');
      }
      setModal(null);
      fetchAll();
    } catch (err) {
      toast(err.response?.data?.message ?? 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (p) => {
    try {
      await adminApi.patch(`/products/${p.id}/toggle`);
      toast(p.is_active ? 'Product deactivated' : 'Product activated', 'success');
      fetchAll();
    } catch {
      toast('Toggle failed', 'error');
    }
  };

  const openVariant = (productId) => {
    setVariantProductId(productId);
    setVariantForm(EMPTY_VARIANT);
    setModal('variant');
  };

  const saveVariant = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await adminApi.post(`/products/${variantProductId}/variants`, {
        ...variantForm,
        price_paise: Number(variantForm.price_paise),
      });
      toast('Variant added!', 'success');
      setModal(null);
      fetchAll();
    } catch (err) {
      toast(err.response?.data?.message ?? 'Variant save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const fieldChange = (setter) => (e) => setter(f => ({ ...f, [e.target.name]: e.target.value }));

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div />
        <button className="btn btn-primary" onClick={openCreate}>
          <span className="icon">add</span> New Product
        </button>
      </div>

      {loading ? <div className="spinner" /> : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Image</th><th>Name</th><th>Slug</th><th>Category</th><th>Price</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {products.length === 0
                  ? <tr><td colSpan={7} className="empty-state">No products. Create one above.</td></tr>
                  : products.map(p => (
                    <tr key={p.slug ?? p.id}>
                      <td>
                        {p.image_url
                          ? <img src={p.image_url} alt={p.name} style={{ width: 40, height: 56, objectFit: 'cover', borderRadius: 4 }} />
                          : <div style={{ width: 40, height: 56, background: 'var(--surface-low)', borderRadius: 4, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.25rem', color:'var(--outline)' }}>👕</div>
                        }
                      </td>
                      <td style={{ fontWeight: 700 }}>{p.name}</td>
                      <td className="font-mono text-xs text-muted">{p.slug}</td>
                      <td className="text-sm">{p.category ?? p.category_name ?? '—'}</td>
                      <td className="text-sm" style={{ fontWeight: 700 }}>{fmtPrice(p.base_price_paise)}</td>
                      <td>
                        <span className={`badge ${p.is_active !== false ? 'badge-active' : 'badge-inactive'}`}>
                          {p.is_active !== false ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <div className="flex gap-2">
                          <button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)}>
                            <span className="icon">edit</span>
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => openVariant(p.id)} title="Add Variant">
                            <span className="icon">add_circle</span>
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(p)} title={p.is_active ? 'Deactivate' : 'Activate'}>
                            <span className="icon">{p.is_active !== false ? 'visibility_off' : 'visibility'}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create / Edit Product Modal */}
      {(modal === 'create' || modal === 'edit') && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">
              {modal === 'create' ? 'New Product' : 'Edit Product'}
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}><span className="icon">close</span></button>
            </div>
            <form onSubmit={saveProduct}>
              <div className="field">
                <label>Product Name *</label>
                <input className="input" name="name" value={form.name} onChange={handleNameChange} placeholder="Oversized Tee" required />
              </div>
              <div className="field">
                <label>Slug *</label>
                <input className="input" name="slug" value={form.slug} onChange={fieldChange(setForm)} placeholder="oversized-tee" required />
              </div>
              <div className="field">
                <label>Base Price (paise) *</label>
                <input className="input" name="base_price_paise" type="number" min="1" value={form.base_price_paise} onChange={fieldChange(setForm)} placeholder="129900 (=₹1299)" required />
              </div>
              <div className="field">
                <label>Category *</label>
                <select className="input" name="category_id" value={form.category_id} onChange={fieldChange(setForm)} required>
                  <option value="">Select category…</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Description</label>
                <textarea className="input" name="description" value={form.description} onChange={fieldChange(setForm)} rows={3} />
              </div>
              <div className="field">
                <label>Instagram Post URL</label>
                <input className="input" name="instagram_post_url" value={form.instagram_post_url} onChange={fieldChange(setForm)} placeholder="https://instagram.com/p/..." />
              </div>
              <div className="field">
                <label>Product Image</label>
                <input type="file" accept="image/*" onChange={e => setImageFile(e.target.files[0])} style={{ fontSize: '0.875rem' }} />
              </div>
              <div className="flex gap-3 mt-4">
                <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" disabled={saving} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                  {saving ? 'Saving…' : modal === 'create' ? 'Create Product' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Variant Modal */}
      {modal === 'variant' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">
              Add Variant
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}><span className="icon">close</span></button>
            </div>
            <form onSubmit={saveVariant}>
              <div className="grid-2">
                <div className="field">
                  <label>Size</label>
                  <input className="input" name="size" value={variantForm.size} onChange={fieldChange(setVariantForm)} placeholder="XL" />
                </div>
                <div className="field">
                  <label>Colour</label>
                  <input className="input" name="colour" value={variantForm.colour} onChange={fieldChange(setVariantForm)} placeholder="Midnight Black" />
                </div>
              </div>
              <div className="field">
                <label>SKU *</label>
                <input className="input" name="sku" value={variantForm.sku} onChange={fieldChange(setVariantForm)} placeholder="TEE-XL-BLK" required />
              </div>
              <div className="field">
                <label>Price (paise) *</label>
                <input className="input" name="price_paise" type="number" min="1" value={variantForm.price_paise} onChange={fieldChange(setVariantForm)} placeholder="129900" required />
              </div>
              <p className="text-xs text-muted mt-1 mb-4">Initial inventory will be set to 0. Restock from the Inventory page.</p>
              <div className="flex gap-3">
                <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" disabled={saving} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                  {saving ? 'Saving…' : 'Add Variant'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
