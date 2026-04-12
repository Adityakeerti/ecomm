const nodemailer = require('nodemailer');
const pool = require('../utils/db');

// Lazy-init transporter so it doesn't crash at startup if BREVO creds are missing
let _transporter = null;

function getTransporter() {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: process.env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com',
      port: parseInt(process.env.BREVO_SMTP_PORT || '587'),
      secure: false, // STARTTLS
      auth: {
        user: process.env.BREVO_USER,
        pass: process.env.BREVO_PASS
      }
    });
  }
  return _transporter;
}

/**
 * Check if email is configured (BREVO creds in .env).
 * Used to skip or degrade gracefully when not configured.
 */
function isEmailConfigured() {
  return !!(process.env.BREVO_USER && process.env.BREVO_PASS);
}

/**
 * Builds a rich HTML receipt email.
 */
function buildReceiptHtml(order, items = []) {
  const totalRs = (parseInt(order.total_paise) / 100).toFixed(2);
  const itemRows = items.map(item => {
    const subtotalRs = (parseInt(item.subtotal_paise) / 100).toFixed(2);
    return `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #eee;">${item.product_name}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;">${item.size} / ${item.colour}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${item.quantity}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">₹${subtotalRs}</td>
      </tr>`;
  }).join('');

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Order Confirmed</title></head>
<body style="font-family:Arial,sans-serif;background:#f9f9f9;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">

    <!-- Header -->
    <div style="background:#1a1a2e;padding:30px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:24px;">Order Confirmed ✅</h1>
      <p style="color:#a0aec0;margin:8px 0 0;">${order.order_number}</p>
    </div>

    <!-- Body -->
    <div style="padding:30px;">
      <p style="color:#333;">Hi <strong>${order.customer_name || 'there'}</strong>,</p>
      <p style="color:#555;">Thank you for your order! Here's your receipt:</p>

      <!-- Order Meta -->
      <table style="width:100%;margin-bottom:20px;border-collapse:collapse;">
        <tr>
          <td style="padding:6px 0;color:#888;font-size:13px;">Customer ID</td>
          <td style="padding:6px 0;font-weight:bold;">${order.customer_display_id}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#888;font-size:13px;">Delivery Address</td>
          <td style="padding:6px 0;">${order.delivery_address || '–'}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#888;font-size:13px;">Zone</td>
          <td style="padding:6px 0;">${order.zone_label || '–'}</td>
        </tr>
      </table>

      <!-- Items Table -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <thead>
          <tr style="background:#f0f0f0;">
            <th style="padding:10px;text-align:left;font-size:13px;">Product</th>
            <th style="padding:10px;text-align:left;font-size:13px;">Variant</th>
            <th style="padding:10px;text-align:center;font-size:13px;">Qty</th>
            <th style="padding:10px;text-align:right;font-size:13px;">Subtotal</th>
          </tr>
        </thead>
        <tbody>${itemRows || '<tr><td colspan="4" style="padding:8px;color:#888;">No items</td></tr>'}</tbody>
        <tfoot>
          <tr>
            <td colspan="3" style="padding:12px;text-align:right;font-weight:bold;">Total</td>
            <td style="padding:12px;text-align:right;font-weight:bold;font-size:18px;">₹${totalRs}</td>
          </tr>
        </tfoot>
      </table>

      <p style="color:#555;font-size:14px;">You'll receive updates via WhatsApp once your order is dispatched.</p>
      <p style="color:#555;font-size:14px;">To track your order, visit our website and use your Customer ID: <strong>${order.customer_display_id}</strong></p>
    </div>

    <!-- Footer -->
    <div style="background:#f0f0f0;padding:16px;text-align:center;">
      <p style="color:#888;font-size:12px;margin:0;">This is an automated receipt. Please do not reply to this email.</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Send order receipt email and log it to receipt_log.
 * Gracefully skips (logs warning) if BREVO is not configured.
 *
 * @param {object} order  - order row from v_order_summary (needs order_number, customer_display_id, total_paise, etc.)
 * @param {string} customerEmail
 * @param {Array}  items  - order_items rows
 * @param {object} dbClient  - optional pg client (for transactions); if null, uses pool
 */
exports.sendOrderReceipt = async (order, customerEmail, items = [], dbClient = null) => {
  const query = dbClient
    ? (sql, params) => dbClient.query(sql, params)
    : (sql, params) => pool.query(sql, params);

  // Skip if Brevo not configured
  if (!isEmailConfigured()) {
    console.warn('Email: BREVO_USER/BREVO_PASS not set — skipping email send');
    await query(
      `INSERT INTO receipt_log (order_id, channel, recipient, status, payload, sent_at, error)
       VALUES ($1, 'EMAIL', $2, 'FAILED', $3, NOW(), $4)`,
      [
        order.id,
        customerEmail,
        JSON.stringify({ order_number: order.order_number }),
        'BREVO not configured'
      ]
    );
    return { sent: false, reason: 'not_configured' };
  }

  try {
    const transporter = getTransporter();
    const brandEmail = process.env.BRAND_FROM_EMAIL || 'orders@yourbrand.com';

    const info = await transporter.sendMail({
      from: `"Order Receipts" <${brandEmail}>`,
      to: customerEmail,
      subject: `Order Confirmed — ${order.order_number}`,
      html: buildReceiptHtml(order, items)
    });

    console.log(`Email: receipt sent to ${customerEmail} | messageId=${info.messageId}`);

    // Log success to receipt_log
    await query(
      `INSERT INTO receipt_log (order_id, channel, recipient, status, payload, sent_at)
       VALUES ($1, 'EMAIL', $2, 'SENT', $3, NOW())`,
      [
        order.id,
        customerEmail,
        JSON.stringify({ order_number: order.order_number, messageId: info.messageId })
      ]
    );

    return { sent: true, messageId: info.messageId };

  } catch (err) {
    console.error(`Email: failed to send receipt for ${order.order_number}:`, err.message);

    // Log failure to receipt_log
    await query(
      `INSERT INTO receipt_log (order_id, channel, recipient, status, payload, sent_at, error)
       VALUES ($1, 'EMAIL', $2, 'FAILED', $3, NOW(), $4)`,
      [
        order.id,
        customerEmail,
        JSON.stringify({ order_number: order.order_number }),
        err.message
      ]
    );

    return { sent: false, reason: err.message };
  }
};

/**
 * DEV helper: send a test email immediately (used only by /admin/test-email route).
 */
exports.sendTestEmail = async (to) => {
  if (!isEmailConfigured()) {
    return { sent: false, reason: 'BREVO_USER/BREVO_PASS not set in .env' };
  }
  try {
    const transporter = getTransporter();
    const info = await transporter.sendMail({
      from: process.env.BRAND_FROM_EMAIL || 'orders@yourbrand.com',
      to,
      subject: 'Test Email — Brevo SMTP working',
      html: '<h2>✅ Brevo SMTP is working!</h2><p>This is a test email from your e-commerce backend.</p>'
    });
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
};
