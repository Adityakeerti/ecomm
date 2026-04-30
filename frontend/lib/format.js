/**
 * lib/format.js
 * Shared formatting utilities.
 */

/**
 * Format paise → "₹1,299"
 * Backend stores all amounts in paise (1 INR = 100 paise)
 */
export function formatPrice(paise) {
  if (paise == null || isNaN(paise)) return '₹0';
  const rupees = paise / 100;
  return rupees.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  });
}

/**
 * Ensure phone is in +91XXXXXXXXXX format.
 * Accepts 10-digit number (auto-prepends +91) or full +91 format.
 */
export function formatPhone(input) {
  const digits = String(input).replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return input; // return as-is if format is unknown
}

/**
 * Status badge color classes by order status.
 */
export function statusColor(status) {
  const map = {
    PENDING:    { bg: '#FFF3CD', color: '#856404' },
    PROCESSING: { bg: '#D1E7FF', color: '#0A4F8F' },
    DISPATCHED: { bg: '#E0DBFF', color: '#3730A3' },
    DELIVERED:  { bg: '#D1FAE5', color: '#065F46' },
    CANCELLED:  { bg: '#FFE0E0', color: '#991B1B' },
    REQUESTED:  { bg: '#FFF3CD', color: '#856404' },
    APPROVED:   { bg: '#D1FAE5', color: '#065F46' },
    REJECTED:   { bg: '#FFE0E0', color: '#991B1B' },
    REFUNDED:   { bg: '#D1E7FF', color: '#0A4F8F' },
  };
  return map[status] || { bg: '#E8E8E8', color: '#434656' };
}

/**
 * Dispatch a global cart-updated event so Navbar can re-fetch cart count.
 */
export function notifyCartUpdate() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('cart-updated'));
  }
}
