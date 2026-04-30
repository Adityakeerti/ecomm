export const fmtPrice = (p) => p == null ? '—' : (p / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
export const fmtDateTime = (iso) => { if (!iso) return '—'; return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
export const toSlug = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const statusBadgeClass = (s) => {
  const m = { PENDING:'badge-pending', PROCESSING:'badge-processing', DISPATCHED:'badge-dispatched', DELIVERED:'badge-delivered', CANCELLED:'badge-cancelled', FAILED:'badge-failed', REQUESTED:'badge-requested', APPROVED:'badge-approved', REJECTED:'badge-rejected', REFUNDED:'badge-refunded', READY:'badge-ready', COMPLETED:'badge-completed', SUCCESS:'badge-success' };
  return `badge ${m[s] || 'badge-inactive'}`;
};

export const NAV = [
  { href: '/admin',            icon: 'dashboard',        label: 'Dashboard'  },
  { href: '/admin/orders',     icon: 'shopping_bag',     label: 'Orders'     },
  { href: '/admin/products',   icon: 'checkroom',        label: 'Products'   },
  { href: '/admin/inventory',  icon: 'inventory_2',      label: 'Inventory'  },
  { href: '/admin/dispatch',   icon: 'local_shipping',   label: 'Dispatch'   },
  { href: '/admin/returns',    icon: 'assignment_return',label: 'Returns'    },
  { href: '/admin/operations', icon: 'settings',         label: 'Operations' },
];

export const PAGE_TITLES = {
  '/admin':'/admin','/admin/orders':'Orders','/admin/products':'Products',
  '/admin/inventory':'Inventory','/admin/dispatch':'Dispatch',
  '/admin/returns':'Returns','/admin/operations':'Operations',
};
