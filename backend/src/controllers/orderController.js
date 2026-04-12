const pool = require('../utils/db');
const { buildReceiptUrl } = require('../utils/whatsapp');
const { ok, notFound, error } = require('../utils/response');

/**
 * GET /orders/:orderNumber/confirmation
 * Query v_order_summary, build wa.me receipt URL.
 */
exports.getConfirmation = async (req, res) => {
  try {
    const { orderNumber } = req.params;

    const { rows } = await pool.query(
      `SELECT * FROM v_order_summary WHERE order_number = $1`,
      [orderNumber]
    );

    if (rows.length === 0) return notFound(res, 'Order not found');

    const order = rows[0];
    const whatsapp_url = buildReceiptUrl(order);

    return ok(res, {
      order_number: order.order_number,
      customer_display_id: order.customer_display_id,
      status: order.status,
      payment_status: order.payment_status,
      total_paise: order.total_paise,
      customer_name: order.customer_name,
      delivery_address: order.delivery_address,
      zone_label: order.zone_label,
      created_at: order.created_at,
      whatsapp_url
    });
  } catch (err) {
    console.error('getConfirmation error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * POST /track/lookup
 * Body: { phone } — returns all orders for that phone number.
 */
exports.lookupByPhone = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone || !/^\+91\d{10}$/.test(phone)) {
      return error(res, 'Phone must be in +91XXXXXXXXXX format');
    }

    const { rows } = await pool.query(
      `SELECT
         o.order_number,
         o.customer_display_id,
         o.status,
         o.payment_status,
         o.total_paise,
         o.created_at,
         dz.label AS zone_label
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       JOIN delivery_zones dz ON dz.id = o.zone_id
       WHERE c.phone_number = $1
       ORDER BY o.created_at DESC`,
      [phone]
    );

    return ok(res, { orders: rows, count: rows.length });
  } catch (err) {
    console.error('lookupByPhone error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * GET /track/:orderNumber?phone=LAST4
 * Full order detail — ownership verified by last 4 digits of phone.
 */
exports.trackOrder = async (req, res) => {
  try {
    const { orderNumber } = req.params;
    const { phone } = req.query; // last 4 digits

    if (!phone || phone.length !== 4) {
      return error(res, 'phone query param must be last 4 digits of your phone number');
    }

    // Fetch order with ownership check
    const { rows } = await pool.query(
      `SELECT v.*, c.phone_number
       FROM v_order_summary v
       JOIN orders o ON o.order_number = v.order_number
       JOIN customers c ON c.id = o.customer_id
       WHERE v.order_number = $1`,
      [orderNumber]
    );

    if (rows.length === 0) return notFound(res, 'Order not found');

    const order = rows[0];

    // Verify last 4 digits
    if (order.phone_number.slice(-4) !== phone) {
      return error(res, 'Phone number does not match', [], 403);
    }

    // Fetch batch stop status if dispatched
    let stopStatus = null;
    if (order.batch_id) {
      const { rows: stops } = await pool.query(
        `SELECT bs.stop_number, bs.status AS stop_status, bs.delivered_at, bs.failure_reason
         FROM batch_stops bs
         JOIN orders o ON o.id = bs.order_id
         WHERE o.order_number = $1`,
        [orderNumber]
      );
      if (stops.length > 0) stopStatus = stops[0];
    }

    // Fetch order items
    const { rows: items } = await pool.query(
      `SELECT p.name AS product_name, pv.size, pv.colour, oi.quantity, oi.unit_price_paise, oi.subtotal_paise
       FROM order_items oi
       JOIN product_variants pv ON pv.id = oi.variant_id
       JOIN products p ON p.id = pv.product_id
       JOIN orders o ON o.id = oi.order_id
       WHERE o.order_number = $1`,
      [orderNumber]
    );

    return ok(res, {
      order_number: order.order_number,
      customer_display_id: order.customer_display_id,
      status: order.status,
      payment_status: order.payment_status,
      total_paise: order.total_paise,
      delivery_address: order.delivery_address,
      zone_label: order.zone_label,
      emp_name: order.emp_name,
      batch_status: order.batch_status,
      stop_status: stopStatus,
      items,
      created_at: order.created_at
    });
  } catch (err) {
    console.error('trackOrder error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
