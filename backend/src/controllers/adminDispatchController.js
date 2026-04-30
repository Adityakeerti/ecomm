const pool = require('../utils/db');
const valkey = require('../utils/valkey');
const { optimiseRoute } = require('../utils/routeOptimiser');

async function getDispatchableStatuses() {
  const { rows } = await pool.query(
    `SELECT enumlabel
     FROM pg_enum
     WHERE enumtypid = 'order_status'::regtype
     ORDER BY enumsortorder`
  );
  const available = new Set(rows.map(r => r.enumlabel));
  const dispatchable = ['PENDING'];
  if (available.has('PROCESSING')) dispatchable.push('PROCESSING');
  return dispatchable;
}

/**
 * GET /admin/dispatch/ready
 * Query v_dispatch_ready view — shows zones meeting both threshold conditions
 */
exports.getDispatchReady = async (req, res) => {
  try {
    const dispatchableStatuses = await getDispatchableStatuses();
    const { rows } = await pool.query(
      `SELECT
          dz.id AS zone_id,
          dz.label AS zone_label,
          ct.name AS city,
          COUNT(o.id) AS pending_order_count,
          dz.min_order_count,
          dz.cutoff_time,
          MIN(o.created_at) AS oldest_order_at,
          db.id AS batch_id,
          db.emp_id,
          db.status AS batch_status
       FROM delivery_zones dz
       JOIN cities ct ON ct.id = dz.city_id
       LEFT JOIN orders o ON o.zone_id = dz.id
                        AND o.status = ANY($1::order_status[])
                        AND o.payment_status IN ('SUCCESS', 'INITIATED')
       LEFT JOIN dispatch_batches db ON db.zone_id = dz.id
                                   AND db.batch_date = CURRENT_DATE
                                   AND db.status IN ('OPEN', 'READY')
       WHERE dz.is_active = TRUE
       GROUP BY dz.id, dz.label, ct.name, dz.min_order_count, dz.cutoff_time, db.id, db.emp_id, db.status
       HAVING
         (((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::time >= dz.cutoff_time) AND COUNT(o.id) >= dz.min_order_count)
         OR db.status IN ('OPEN', 'READY')`
      ,
      [dispatchableStatuses]
    );

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
        row.emp_id = null;
        row.batch_status = 'READY';
      } else {
        // Update existing batch to READY if it's currently OPEN
        await pool.query(
          `UPDATE dispatch_batches SET status = 'READY'
           WHERE id = $1 AND status = 'OPEN'`,
          [row.batch_id]
        );
        // Fetch the latest emp_id and status from the batch (view may not expose these)
        const { rows: batchDetail } = await pool.query(
          `SELECT emp_id, status FROM dispatch_batches WHERE id = $1`,
          [row.batch_id]
        );
        if (batchDetail.length > 0) {
          row.emp_id = batchDetail[0].emp_id ?? null;
          row.batch_status = batchDetail[0].status;
        }
      }
    }

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Get dispatch ready error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * GET /admin/dispatch/dispatched-orders
 * Shows latest orders already marked as DISPATCHED (manual or batched).
 */
exports.getDispatchedOrders = async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 100));
    const { rows } = await pool.query(
      `SELECT
          id,
          order_number,
          customer_name,
          customer_phone,
          zone_label,
          total_paise,
          status,
          payment_status,
          batch_id,
          created_at
       FROM v_order_summary
       WHERE status = 'DISPATCHED'
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Get dispatched orders error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
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
    // emp_id here is the human-readable string (e.g. "EMP001"), not the UUID
    const { rows: empRows } = await pool.query(
      `SELECT id, zone_id FROM delivery_staff WHERE emp_id = $1 AND is_active = TRUE`,
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

    // Assign the EMP's UUID id (not the emp_id string) to the batch
    const staffUuid = empRows[0].id;
    await pool.query(
      `UPDATE dispatch_batches SET emp_id = $1 WHERE id = $2`,
      [staffUuid, id]
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
    const dispatchableStatuses = await getDispatchableStatuses();

    // Fetch the batch
    const { rows: batchRows } = await client.query(
      `SELECT id, zone_id, emp_id, status FROM dispatch_batches WHERE id = $1`,
      [id]
    );

    if (batchRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Batch not found' });
    }

    const batch = batchRows[0];

    if (batch.status === 'DISPATCHED') {
      return res.status(400).json({ success: false, message: 'Batch already dispatched' });
    }

    if (!batch.emp_id) {
      return res.status(400).json({ success: false, message: 'Batch has no assigned employee. Assign an EMP first.' });
    }

    // Step 1: Fetch all dispatchable paid orders for this batch's zone (today's cutoff window)
    const { rows: orders } = await client.query(
      `SELECT o.id AS order_id, da.lat, da.lng, da.address_line
       FROM orders o
       JOIN delivery_addresses da ON da.id = o.address_id
       WHERE o.zone_id = $1
         AND o.status = ANY($2::order_status[])
         AND o.payment_status IN ('SUCCESS', 'INITIATED')
       ORDER BY o.created_at ASC`,
      [batch.zone_id, dispatchableStatuses]
    );

    if (orders.length === 0) {
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
      // Keep mapping until batch completion; completion flow clears this key.
      await valkey.set(`emp:${batch.emp_id}:active_batch`, id);
    } catch (valkeyErr) {
      console.warn('Failed to set active batch in Valkey:', valkeyErr.message);
      // Non-critical — don't fail the dispatch
    }

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
    console.error('Dispatch batch error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    client.release();
  }
};
