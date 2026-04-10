const pool = require('../utils/db');
const valkey = require('../utils/valkey');
const { optimiseRoute } = require('../utils/routeOptimiser');

/**
 * GET /admin/dispatch/ready
 * Query v_dispatch_ready view — shows zones meeting both threshold conditions
 */
exports.getDispatchReady = async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM v_dispatch_ready`);

    // For zones that don't have a batch yet, auto-create one
    for (const row of rows) {
      if (!row.batch_id) {
        const { rows: batchRows } = await pool.query(
          `INSERT INTO dispatch_batches (zone_id, batch_date, status)
           VALUES ($1, CURRENT_DATE, 'READY')
           RETURNING id`,
          [row.zone_id]
        );
        row.batch_id = batchRows[0].id;
      } else {
        // Update existing batch to READY if it's currently OPEN
        await pool.query(
          `UPDATE dispatch_batches SET status = 'READY'
           WHERE id = $1 AND status = 'OPEN'`,
          [row.batch_id]
        );
      }
    }

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Get dispatch ready error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * POST /admin/dispatch/batches/:id/assign
 * Assign an EMP to a batch. Validates that the EMP belongs to the batch's zone.
 */
exports.assignBatch = async (req, res) => {
  try {
    const { id } = req.params;
    const { emp_id } = req.body;

    if (!emp_id) {
      return res.status(400).json({ success: false, message: 'emp_id is required' });
    }

    // Fetch the batch to get its zone_id
    const { rows: batchRows } = await pool.query(
      `SELECT zone_id, status FROM dispatch_batches WHERE id = $1`,
      [id]
    );

    if (batchRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Batch not found' });
    }

    const batch = batchRows[0];

    // Validate EMP belongs to the batch's zone
    const { rows: empRows } = await pool.query(
      `SELECT id, zone_id FROM delivery_staff WHERE id = $1 AND is_active = TRUE`,
      [emp_id]
    );

    if (empRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Employee not found or inactive' });
    }

    if (empRows[0].zone_id !== batch.zone_id) {
      return res.status(400).json({
        success: false,
        message: 'Employee does not belong to this batch\'s delivery zone'
      });
    }

    // Assign the EMP to the batch
    await pool.query(
      `UPDATE dispatch_batches SET emp_id = $1 WHERE id = $2`,
      [emp_id, id]
    );

    res.json({ success: true, message: 'Employee assigned to batch successfully' });
  } catch (err) {
    console.error('Assign batch error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * POST /admin/dispatch/batches/:id/dispatch
 * Dispatch a batch — full 10-step process:
 *   1. Fetch PENDING orders for this batch's zone (today's cutoff window)
 *   2. Extract delivery lat/lng from their delivery_addresses
 *   3. Call optimiseRoute(stops)
 *   4. Build stop_sequence JSONB
 *   5-9. Transaction: INSERT batch_stops, UPDATE orders, UPDATE batch
 *   10. Write active batch to Valkey
 */
exports.dispatchBatch = async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;

    // Fetch the batch
    const { rows: batchRows } = await pool.query(
      `SELECT id, zone_id, emp_id, status FROM dispatch_batches WHERE id = $1`,
      [id]
    );

    if (batchRows.length === 0) {
      client.release();
      return res.status(404).json({ success: false, message: 'Batch not found' });
    }

    const batch = batchRows[0];

    if (batch.status === 'DISPATCHED') {
      client.release();
      return res.status(400).json({ success: false, message: 'Batch already dispatched' });
    }

    if (!batch.emp_id) {
      client.release();
      return res.status(400).json({ success: false, message: 'Batch has no assigned employee. Assign an EMP first.' });
    }

    // Step 1: Fetch all PENDING orders for this batch's zone (today's cutoff window)
    const { rows: orders } = await pool.query(
      `SELECT o.id AS order_id, da.lat, da.lng, da.address_line
       FROM orders o
       JOIN delivery_addresses da ON da.id = o.address_id
       WHERE o.zone_id = $1
         AND o.status = 'PENDING'
         AND o.payment_status = 'SUCCESS'
       ORDER BY o.created_at ASC`,
      [batch.zone_id]
    );

    if (orders.length === 0) {
      client.release();
      return res.status(400).json({ success: false, message: 'No pending orders found for this zone' });
    }

    // Step 2: Extract delivery lat/lng (already done in query above)
    // Step 3: Call optimiseRoute(stops)
    const stops = orders.map(o => ({
      order_id: o.order_id,
      lat: parseFloat(o.lat),
      lng: parseFloat(o.lng),
      address_line: o.address_line
    }));

    const optimisedStops = await optimiseRoute(stops);

    // Step 4: Build the stop_sequence JSONB
    const stopSequence = optimisedStops.map((stop, index) => ({
      order_id: stop.order_id,
      stop_number: index + 1,
      lat: stop.lat,
      lng: stop.lng,
      address: stop.address_line
    }));

    // Step 5: BEGIN transaction
    await client.query('BEGIN');

    try {
      // Step 6: INSERT batch_stops rows
      for (let i = 0; i < optimisedStops.length; i++) {
        await client.query(
          `INSERT INTO batch_stops (batch_id, order_id, stop_number)
           VALUES ($1, $2, $3)`,
          [id, optimisedStops[i].order_id, i + 1]
        );
      }

      // Step 7: UPDATE all orders SET status='DISPATCHED', batch_id=this_batch_id
      const orderIds = optimisedStops.map(s => s.order_id);
      await client.query(
        `UPDATE orders SET status = 'DISPATCHED', batch_id = $1
         WHERE id = ANY($2::uuid[])`,
        [id, orderIds]
      );

      // Step 8: UPDATE dispatch_batches
      await client.query(
        `UPDATE dispatch_batches
         SET status = 'DISPATCHED',
             stop_sequence = $1,
             dispatched_at = NOW()
         WHERE id = $2`,
        [JSON.stringify(stopSequence), id]
      );

      // Step 9: COMMIT
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    }

    // Step 10: Write active batch to Valkey
    try {
      await valkey.set(`emp:${batch.emp_id}:active_batch`, id, 'EX', 86400);
    } catch (valkeyErr) {
      console.warn('Failed to set active batch in Valkey:', valkeyErr.message);
      // Non-critical — don't fail the dispatch
    }

    client.release();

    res.json({
      success: true,
      message: 'Batch dispatched successfully',
      data: {
        batch_id: id,
        stop_count: optimisedStops.length,
        dispatched_at: new Date().toISOString(),
        stop_sequence: stopSequence
      }
    });
  } catch (err) {
    client.release();
    console.error('Dispatch batch error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
