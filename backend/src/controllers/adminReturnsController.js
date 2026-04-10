const pool = require('../utils/db');

/**
 * GET /admin/returns
 * Query returns JOIN orders JOIN customers.
 * Supports status filter + pagination.
 */
exports.listReturns = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const conditions = ['1=1'];
    const params = [];

    // Status filter
    if (req.query.status) {
      params.push(req.query.status);
      conditions.push(`r.status = $${params.length}`);
    }

    const whereClause = conditions.join(' AND ');

    // Main query with JOINs
    const query = `
      SELECT
        r.id,
        r.return_id,
        r.order_id,
        r.reason,
        r.status,
        r.admin_notes,
        r.refund_ref,
        r.requested_at,
        r.resolved_at,
        o.order_number,
        o.total_paise,
        o.status AS order_status,
        c.id AS customer_id,
        c.full_name AS customer_name,
        c.phone_number AS customer_phone,
        c.email AS customer_email
      FROM returns r
      JOIN orders o ON o.id = r.order_id
      JOIN customers c ON c.id = r.customer_id
      WHERE ${whereClause}
      ORDER BY r.requested_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    // Count query
    const countQuery = `
      SELECT COUNT(*) FROM returns r WHERE ${whereClause}
    `;

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
    console.error('List returns error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * PATCH /admin/returns/:id
 * UPDATE returns SET status, admin_notes, resolved_at=NOW()
 * If status=REFUNDED: also save refund_ref and update order.status=REFUNDED.
 */
exports.updateReturn = async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { status, admin_notes, refund_ref } = req.body;

    if (!status) {
      client.release();
      return res.status(400).json({ success: false, message: 'status is required' });
    }

    // Valid return statuses
    const validStatuses = ['REQUESTED', 'APPROVED', 'REJECTED', 'REFUNDED'];
    if (!validStatuses.includes(status)) {
      client.release();
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    // Fetch the return to get order_id
    const { rows: returnRows } = await client.query(
      `SELECT id, order_id, status AS current_status FROM returns WHERE id = $1`,
      [id]
    );

    if (returnRows.length === 0) {
      client.release();
      return res.status(404).json({ success: false, message: 'Return not found' });
    }

    const returnRecord = returnRows[0];

    // If status is REFUNDED, refund_ref is required
    if (status === 'REFUNDED' && !refund_ref) {
      client.release();
      return res.status(400).json({
        success: false,
        message: 'refund_ref is required when setting status to REFUNDED'
      });
    }

    await client.query('BEGIN');

    try {
      // Update the return
      const updateFields = ['status = $1', 'resolved_at = NOW()'];
      const updateParams = [status];

      if (admin_notes !== undefined) {
        updateParams.push(admin_notes);
        updateFields.push(`admin_notes = $${updateParams.length}`);
      }

      if (refund_ref) {
        updateParams.push(refund_ref);
        updateFields.push(`refund_ref = $${updateParams.length}`);
      }

      updateParams.push(id);

      await client.query(
        `UPDATE returns SET ${updateFields.join(', ')} WHERE id = $${updateParams.length}`,
        updateParams
      );

      // If REFUNDED, also update order status
      if (status === 'REFUNDED') {
        await client.query(
          `UPDATE orders SET status = 'REFUNDED' WHERE id = $1`,
          [returnRecord.order_id]
        );
      }

      await client.query('COMMIT');
      client.release();

      res.json({
        success: true,
        message: `Return updated to ${status}`,
        data: {
          return_id: id,
          status,
          order_id: returnRecord.order_id,
          order_status_updated: status === 'REFUNDED' ? 'REFUNDED' : null
        }
      });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    }
  } catch (err) {
    client.release();
    console.error('Update return error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
