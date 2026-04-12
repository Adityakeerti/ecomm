const pool = require('../utils/db');
const { ok, notFound, error } = require('../utils/response');

/**
 * Generate return_id in format: RET-{OrderNumber}-{3RandomChars}
 */
function generateReturnId(orderNumber) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  let suffix = '';
  for (let i = 0; i < 3; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `RET-${orderNumber}-${suffix}`;
}

/**
 * POST /returns
 * Body: { order_number, phone, reason }
 * Verify: order exists + ownership + status=DELIVERED + no existing return.
 */
exports.createReturn = async (req, res) => {
  try {
    const { order_number, phone, reason } = req.body;

    if (!order_number) return error(res, 'order_number is required');
    if (!phone || !/^\+91\d{10}$/.test(phone)) {
      return error(res, 'phone must be in +91XXXXXXXXXX format');
    }
    if (!reason || reason.trim().length < 5) {
      return error(res, 'reason is required (min 5 chars)');
    }

    // Fetch order + customer for ownership check
    const { rows } = await pool.query(
      `SELECT o.id, o.order_number, o.status, o.customer_id, c.phone_number
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       WHERE o.order_number = $1`,
      [order_number]
    );

    if (rows.length === 0) return notFound(res, 'Order not found');

    const order = rows[0];

    // Ownership check
    if (order.phone_number !== phone) {
      return error(res, 'Phone number does not match this order', [], 403);
    }

    // Only DELIVERED orders can be returned
    if (order.status !== 'DELIVERED') {
      return error(res, `Returns are only allowed for delivered orders. Current status: ${order.status}`, [], 422);
    }

    // Check for existing return
    const { rows: existing } = await pool.query(
      `SELECT id FROM returns WHERE order_id = $1`,
      [order.id]
    );
    if (existing.length > 0) {
      return error(res, 'A return has already been requested for this order', [], 409);
    }

    // Generate unique return_id (retry on collision)
    let return_id;
    let attempts = 0;
    while (attempts < 5) {
      const candidate = generateReturnId(order_number);
      const { rows: collision } = await pool.query(
        `SELECT id FROM returns WHERE return_id = $1`, [candidate]
      );
      if (collision.length === 0) { return_id = candidate; break; }
      attempts++;
    }
    if (!return_id) return error(res, 'Failed to generate return ID, please try again');

    // Insert return row
    const { rows: [returnRow] } = await pool.query(
      `INSERT INTO returns (return_id, order_id, customer_id, reason, status)
       VALUES ($1, $2, $3, $4, 'REQUESTED')
       RETURNING return_id, status, requested_at`,
      [return_id, order.id, order.customer_id, reason.trim()]
    );

    return ok(res, {
      return_id: returnRow.return_id,
      order_number,
      status: returnRow.status,
      requested_at: returnRow.requested_at,
      message: 'Return request submitted. Our team will review within 24 hours.'
    }, 'Return requested');

  } catch (err) {
    console.error('createReturn error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * GET /returns/:returnId?phone=LAST4
 * Simple lookup with last-4 phone ownership check.
 */
exports.getReturn = async (req, res) => {
  try {
    const { returnId } = req.params;
    const { phone } = req.query; // last 4 digits

    if (!phone || phone.length !== 4) {
      return error(res, 'phone query param must be last 4 digits of your phone number');
    }

    const { rows } = await pool.query(
      `SELECT r.return_id, r.status, r.reason, r.admin_notes,
              r.refund_ref, r.requested_at, r.resolved_at,
              o.order_number, o.total_paise,
              c.full_name, c.phone_number
       FROM returns r
       JOIN orders o ON o.id = r.order_id
       JOIN customers c ON c.id = r.customer_id
       WHERE r.return_id = $1`,
      [returnId]
    );

    if (rows.length === 0) return notFound(res, 'Return not found');

    const ret = rows[0];

    // Ownership check by last 4 digits
    if (ret.phone_number.slice(-4) !== phone) {
      return error(res, 'Phone number does not match', [], 403);
    }

    return ok(res, {
      return_id: ret.return_id,
      order_number: ret.order_number,
      status: ret.status,
      reason: ret.reason,
      admin_notes: ret.admin_notes,
      refund_ref: ret.refund_ref,
      requested_at: ret.requested_at,
      resolved_at: ret.resolved_at,
      customer_name: ret.full_name,
      order_total_paise: ret.total_paise
    });

  } catch (err) {
    console.error('getReturn error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
