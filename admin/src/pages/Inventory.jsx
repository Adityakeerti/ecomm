import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '../lib/api';
import { useToast } from '../contexts/ToastContext';

export default function Inventory() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [restockModal, setRestockModal] = useState(null); // { variantId, sku, current }
  const [qty, setQty] = useState('');
  const [saving, setSaving] = useState(false);

  const fetch_ = useCallback(() => {
    setLoading(true);
    // Fetch from v1 products and flatten variants
    window.fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000/v1'}/products`)
      .then(r => r.json())
      .then(data => {
        const products = data.data ?? data ?? [];
        const rows = [];
        products.forEach(p => {
          (p.variants ?? []).forEach(v => {
            rows.push({
              variant_id: v.id,
              sku: v.sku,
              product: p.name,
              size: v.size,
              colour: v.colour,
              quantity: v.quantity ?? v.available_qty ?? 0,
              reserved: v.reserved ?? 0,
            });
          });
        });
        setItems(rows);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  const restock = async (e) => {
    e.preventDefault();
    if (!qty || Number(qty) < 1) return;
    setSaving(true);
    try {
      await adminApi.patch(`/inventory/${restockModal.variantId}/restock`, { quantity_to_add: Number(qty) });
      toast(`Restocked +${qty}`, 'success');
      setRestockModal(null);
      setQty('');
      fetch_();
    } catch (err) {
      toast(err.response?.data?.message ?? 'Restock failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const stockColor = (qty) => {
    if (qty === 0)  return '#DC2626';
    if (qty <= 5)   return '#D97706';
    return 'var(--success)';
  };

  return (
    <div>
      {loading ? <div className="spinner" /> : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Product</th><th>SKU</th><th>Size</th><th>Colour</th><th>Available</th><th>Reserved</th><th>Action</th></tr>
              </thead>
              <tbody>
                {items.length === 0
                  ? <tr><td colSpan={7} className="empty-state">No inventory yet. Create products with variants first.</td></tr>
                  : items.map(i => (
                    <tr key={i.variant_id}>
                      <td style={{ fontWeight: 600 }}>{i.product}</td>
                      <td className="font-mono text-xs">{i.sku}</td>
                      <td className="text-sm">{i.size || '—'}</td>
                      <td className="text-sm">{i.colour || '—'}</td>
                      <td>
                        <span style={{ fontWeight: 800, color: stockColor(i.quantity) }}>{i.quantity}</span>
                      </td>
                      <td className="text-sm text-muted">{i.reserved}</td>
                      <td>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => { setRestockModal({ variantId: i.variant_id, sku: i.sku, current: i.quantity }); setQty(''); }}
                        >
                          <span className="icon">add</span> Restock
                        </button>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      )}

      {restockModal && (
        <div className="modal-overlay" onClick={() => setRestockModal(null)}>
          <div className="modal" style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">
              Restock — <span className="font-mono" style={{ color: 'var(--primary)'}}>{restockModal.sku}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setRestockModal(null)}><span className="icon">close</span></button>
            </div>
            <p className="text-sm text-muted mb-4">Current stock: <strong>{restockModal.current}</strong></p>
            <form onSubmit={restock}>
              <div className="field">
                <label>Quantity to Add</label>
                <input className="input" type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} placeholder="50" required autoFocus />
              </div>
              <div className="flex gap-3">
                <button type="button" className="btn btn-ghost" onClick={() => setRestockModal(null)}>Cancel</button>
                <button type="submit" disabled={saving} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                  {saving ? 'Saving…' : 'Add Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
