const pool = require('../utils/db');

const STATUS_ALIASES = {
  DISPATCH: 'DISPATCHED',
  DISPATCHING: 'DISPATCHED'
};

async function getOrderStatuses() {
  const { rows } = await pool.query(
    `SELECT enumlabel
     FROM pg_enum
     WHERE enumtypid = 'order_status'::regtype
     ORDER BY enumsortorder`
  );
  return rows.map(r => r.enumlabel);
}

function normalizeStatus(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim().toUpperCase();
  return STATUS_ALIASES[trimmed] || trimmed;
}

exports.listOrders = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const conditions = ['1=1'];
    const params = [];

    if (req.query.status) {
      params.push(req.query.status);
      conditions.push('status = $' + params.length);
    }

    if (req.query.zone_id) {
      params.push(req.query.zone_id);
      conditions.push('zone_id::text = $' + params.length);
    }

    const whereClause = conditions.join(' AND ');

    // Main query
    const query = `
      SELECT * FROM v_order_summary 
      WHERE ${whereClause} 
      ORDER BY created_at DESC 
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    // Count query
    const countQuery = `
      SELECT COUNT(*) FROM v_order_summary 
      WHERE ${whereClause}
    `;

    // First do total count (to provide pagination metadata)
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count, 10);

    const { rows } = await pool.query(query, [...params, limit, offset]);

    res.json({
      success: true,
      data: rows,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (err) {
    console.error('List orders error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getOrderDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const { rows: orderRows } = await pool.query(
      `SELECT * FROM v_order_summary WHERE id = $1`,
      [id]
    );

    if (orderRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const order = orderRows[0];

    // Fetch line items
    const { rows: itemRows } = await pool.query(
      `SELECT oi.id, oi.quantity, oi.unit_price_paise, oi.subtotal_paise,
              pv.sku, pv.size, pv.colour, p.name AS product_name
       FROM order_items oi
       JOIN product_variants pv ON pv.id = oi.variant_id
       JOIN products p ON p.id = pv.product_id
       WHERE oi.order_id = $1`,
      [id]
    );

    order.items = itemRows;

    res.json({ success: true, data: order });

  } catch (err) {
    console.error('Get order details error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const status = normalizeStatus(req.body?.status);

    if (!status) {
      return res.status(400).json({ success: false, message: 'Status is required' });
    }

    const allowedStatuses = await getOrderStatuses();
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Allowed statuses: ${allowedStatuses.join(', ')}`
      });
    }

    const { rowCount } = await pool.query(
      `UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2`,
      [status, id]
    );

    if (rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Order not found or status invalid' });
    }

    res.json({ success: true, message: 'Order status updated successfully' });
  } catch (err) {
    console.error('Update order error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.bulkUpdateOrderStatus = async (req, res) => {
  try {
    const orderIds = Array.isArray(req.body?.order_ids) ? req.body.order_ids : [];
    const status = normalizeStatus(req.body?.status);

    if (orderIds.length === 0) {
      return res.status(400).json({ success: false, message: 'order_ids is required' });
    }

    if (!status) {
      return res.status(400).json({ success: false, message: 'Status is required' });
    }

    const allowedStatuses = await getOrderStatuses();
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Allowed statuses: ${allowedStatuses.join(', ')}`
      });
    }

    const { rowCount } = await pool.query(
      `UPDATE orders
       SET status = $1, updated_at = NOW()
       WHERE id = ANY($2::uuid[])`,
      [status, orderIds]
    );

    return res.json({
      success: true,
      message: `Updated ${rowCount} order(s) to ${status}`,
      data: { updated: rowCount, status }
    });
  } catch (err) {
    console.error('Bulk update order status error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
