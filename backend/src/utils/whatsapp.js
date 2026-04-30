/**
 * Builds a wa.me pre-filled WhatsApp message URL for order receipts.
 * The customer taps the link → WhatsApp opens with the message pre-filled → they just hit Send.
 */
exports.buildReceiptUrl = (order) => {
  const phone = process.env.BRAND_WHATSAPP_NUMBER; // e.g. 919876543210
  const totalRs = (parseInt(order.total_paise) / 100).toFixed(2);

  const text = encodeURIComponent(
    `Order Confirmed! ✅\n` +
    `Order ID: ${order.order_number}\n` +
    `Customer ID: ${order.customer_display_id}\n` +
    `Total: ₹${totalRs}\n` +
    `Thank you for shopping with us!`
  );

  return `https://wa.me/${phone}?text=${text}`;
};
