// Price formatting: paise → ₹X,XXX
export const fmtPrice = (paise) => {
  if (paise == null) return '—';
  return (paise / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
};

// Date formatting
export const fmtDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const fmtDateTime = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

// Status → badge class
export const statusBadgeClass = (s) => {
  const map = {
    PENDING: 'badge-pending', PROCESSING: 'badge-processing',
    DISPATCHED: 'badge-dispatched', DELIVERED: 'badge-delivered',
    CANCELLED: 'badge-cancelled', FAILED: 'badge-failed',
    REQUESTED: 'badge-requested', APPROVED: 'badge-approved',
    REJECTED: 'badge-rejected', REFUNDED: 'badge-refunded',
    READY: 'badge-ready', DISPATCHED_BATCH: 'badge-dispatched',
    COMPLETED: 'badge-delivered',
  };
  return `badge ${map[s] || 'badge-inactive'}`;
};

// Build URL-safe slug from name
export const toSlug = (name) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
