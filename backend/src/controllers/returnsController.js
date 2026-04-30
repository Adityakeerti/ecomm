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
 * Body: { order_number, reason }
 * Auth required.
 * Verify: order exists + ownership + delivered within 7 days + no existing return.
 */
exports.createReturn = async (req, res) => {
  try {
    const { order_number, reason } = req.body;
    const customerId = req.user?.userId;

    if (!order_number) return error(res, 'order_number is required');
    if (!reason || reason.trim().length < 5) {
      return error(res, 'reason is required (min 5 chars)');
    }
    if (!customerId) {
      return error(res, 'Unauthorized', [], 401);
    }

    // Fetch order for ownership check
    const { rows } = await pool.query(
      `SELECT o.id, o.order_number, o.status, o.customer_id, bs.delivered_at
       FROM orders o
       LEFT JOIN batch_stops bs ON bs.order_id = o.id AND bs.status = 'DELIVERED'
       WHERE o.order_number = $1 AND o.customer_id = $2`,
      [order_number, customerId]
    );

    if (rows.length === 0) return notFound(res, 'Order not found');

    const order = rows[0];

    // Only DELIVERED orders can be returned
    if (order.status !== 'DELIVERED') {
      return error(res, `Returns are only allowed for delivered orders. Current status: ${order.status}`, [], 422);
    }
    if (!order.delivered_at) {
      return error(res, 'Delivery date not found for this order.', [], 422);
    }
    const deliveredAt = new Date(order.delivered_at);
    const sevenDaysAgo = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000));
    if (deliveredAt < sevenDaysAgo) {
      return error(res, 'Return window has expired. Returns are allowed only within 7 days of delivery.', [], 422);
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
 * GET /returns/eligible-orders
 * Auth required. Returns delivered orders in the last 7 days
 * that do not already have a return request.
 */
exports.getEligibleOrders = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         o.order_number,
         o.total_paise,
         bs.delivered_at
       FROM orders o
       JOIN batch_stops bs ON bs.order_id = o.id
       LEFT JOIN returns r ON r.order_id = o.id
       WHERE o.customer_id = $1
         AND o.status = 'DELIVERED'
         AND bs.status = 'DELIVERED'
         AND bs.delivered_at >= (NOW() - INTERVAL '7 days')
         AND r.id IS NULL
       ORDER BY bs.delivered_at DESC`,
      [req.user.userId]
    );

    return ok(res, { orders: rows, count: rows.length });
  } catch (err) {
    console.error('getEligibleOrders error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * GET /returns/my-requests
 * Auth required. Returns current user's return requests.
 */
exports.listMyReturns = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         r.return_id,
         r.status,
         r.reason,
         r.requested_at,
         r.resolved_at,
         r.admin_notes,
         o.order_number
       FROM returns r
       JOIN orders o ON o.id = r.order_id
       WHERE r.customer_id = $1
       ORDER BY r.requested_at DESC`,
      [req.user.userId]
    );

    return ok(res, { returns: rows, count: rows.length });
  } catch (err) {
    console.error('listMyReturns error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
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
