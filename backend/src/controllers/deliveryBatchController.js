const pool = require('../utils/db');
const valkey = require('../utils/valkey');

/**
 * GET /delivery/batch/active
 * Read emp's active batch from Valkey, then query DB for full detail.
 * Requires empAuth middleware (req.emp is attached).
 */
exports.getActiveBatch = async (req, res) => {
  try {
    const emp = req.emp;

    // Read active batch ID from Valkey
    let batchId = await valkey.get(`emp:${emp.id}:active_batch`);

    // Fallback to DB when Valkey key is missing (e.g. cache flush/restart).
    if (!batchId) {
      const { rows: activeRows } = await pool.query(
        `SELECT id
         FROM dispatch_batches
         WHERE emp_id = $1 AND status = 'DISPATCHED'
         ORDER BY dispatched_at DESC NULLS LAST, created_at DESC
         LIMIT 1`,
        [emp.id]
      );
      if (activeRows.length > 0) {
        batchId = activeRows[0].id;
        try {
          await valkey.set(`emp:${emp.id}:active_batch`, batchId);
        } catch (vErr) {
          console.warn('Failed to repopulate active batch key:', vErr.message);
        }
      }
    }

    if (!batchId) {
      return res.json({
        success: true,
        data: null,
        message: 'No active batch assigned'
      });
    }

    // Fetch full batch detail from DB
    const { rows } = await pool.query(
      `SELECT db.id, db.zone_id, db.emp_id, db.status, db.batch_date,
              db.stop_sequence, db.dispatched_at, db.completed_at,
              dz.label AS zone_label,
              (SELECT COUNT(*) FROM batch_stops WHERE batch_id = db.id) AS total_stops,
              (SELECT COUNT(*) FROM batch_stops WHERE batch_id = db.id AND status IN ('DELIVERED', 'FAILED')) AS completed_stops
       FROM dispatch_batches db
       JOIN delivery_zones dz ON dz.id = db.zone_id
       WHERE db.id = $1 AND db.status = 'DISPATCHED'`,
      [batchId]
    );

    if (rows.length === 0) {
      try {
        await valkey.del(`emp:${emp.id}:active_batch`);
      } catch {}
      return res.json({
        success: true,
        data: null,
        message: 'No active dispatched batch found'
      });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Get active batch error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * GET /delivery/batch/:batchId/stops
 * Query v_batch_stops_detail WHERE batch_id=$1 ORDER BY stop_number.
 * Also compute is_unlocked for each stop (sequential unlock logic).
 */
exports.getBatchStops = async (req, res) => {
  try {
    const { batchId } = req.params;

    // Verify the batch belongs to this employee
    const { rows: batchRows } = await pool.query(
      `SELECT id, emp_id FROM dispatch_batches WHERE id = $1`,
      [batchId]
    );

    if (batchRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Batch not found' });
    }

    if (batchRows[0].emp_id !== req.emp.id) {
      return res.status(403).json({ success: false, message: 'This batch is not assigned to you' });
    }

    // Query stop details directly (LEFT JOIN on items so it works even without order_items)
    const { rows: stops } = await pool.query(
      `SELECT
          bs.id                AS stop_id,
          bs.batch_id,
          bs.stop_number,
          bs.status            AS stop_status,
          bs.failure_reason,
          bs.delivered_at,
          o.order_number,
          o.customer_display_id,
          c.full_name          AS customer_name,
          c.phone_number       AS customer_phone,
          da.address_line,
          da.landmark,
          da.lat,
          da.lng,
          o.total_paise,
          COALESCE(
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'product', p.name,
                'variant', CONCAT(pv.size, ' / ', pv.colour),
                'qty', oi.quantity
              )
            ) FILTER (WHERE oi.id IS NOT NULL),
            '[]'::json
          ) AS items
       FROM batch_stops bs
       JOIN orders o               ON o.id = bs.order_id
       JOIN customers c            ON c.id = o.customer_id
       JOIN delivery_addresses da  ON da.id = o.address_id
       LEFT JOIN order_items oi    ON oi.order_id = o.id
       LEFT JOIN product_variants pv ON pv.id = oi.variant_id
       LEFT JOIN products p        ON p.id = pv.product_id
       WHERE bs.batch_id = $1
       GROUP BY bs.id, bs.batch_id, bs.stop_number, bs.status, bs.failure_reason,
                bs.delivered_at, o.order_number, o.customer_display_id,
                c.full_name, c.phone_number, da.address_line, da.landmark, da.lat, da.lng, o.total_paise
       ORDER BY bs.stop_number`,
      [batchId]
    );

    // Compute is_unlocked for each stop
    const enrichedStops = stops.map((stop, index) => {
      let is_unlocked = false;

      if (stop.stop_number === 1) {
        // First stop is always unlocked (if not already done)
        is_unlocked = true;
      } else {
        // Check if the previous stop is DELIVERED or FAILED
        const prevStop = stops[index - 1];
        if (prevStop && ['DELIVERED', 'FAILED'].includes(prevStop.stop_status)) {
          is_unlocked = true;
        }
      }

      // Already completed stops are also "unlocked" (for display purposes)
      if (['DELIVERED', 'FAILED'].includes(stop.stop_status)) {
        is_unlocked = true;
      }

      return { ...stop, is_unlocked };
    });

    res.json({ success: true, data: enrichedStops });
  } catch (err) {
    console.error('Get batch stops error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * PATCH /delivery/stops/:stopId/deliver
 * Sequential unlock check → update stop DELIVERED → update order DELIVERED
 * → check if all stops done → update batch COMPLETED if so.
 */
exports.deliverStop = async (req, res) => {
  const client = await pool.connect();

  try {
    const { stopId } = req.params;

    // Fetch the stop
    const { rows: stopRows } = await client.query(
      `SELECT * FROM batch_stops WHERE id = $1`,
      [stopId]
    );

    if (stopRows.length === 0) {
      client.release();
      return res.status(404).json({ success: false, message: 'Stop not found' });
    }

    const stop = stopRows[0];

    // Verify the batch belongs to this employee
    const { rows: batchRows } = await client.query(
      `SELECT emp_id FROM dispatch_batches WHERE id = $1`,
      [stop.batch_id]
    );

    if (batchRows[0].emp_id !== req.emp.id) {
      client.release();
      return res.status(403).json({ success: false, message: 'This batch is not assigned to you' });
    }

    // Check if stop is already completed
    if (['DELIVERED', 'FAILED'].includes(stop.status)) {
      client.release();
      return res.status(400).json({ success: false, message: 'Stop already completed' });
    }

    // Sequential unlock check
    if (stop.stop_number > 1) {
      const { rows: prevRows } = await client.query(
        `SELECT status FROM batch_stops WHERE batch_id = $1 AND stop_number = $2`,
        [stop.batch_id, stop.stop_number - 1]
      );

      if (prevRows.length > 0 && !['DELIVERED', 'FAILED'].includes(prevRows[0].status)) {
        client.release();
        return res.status(403).json({
          success: false,
          message: 'Complete previous stop first'
        });
      }
    }

    // Begin transaction
    await client.query('BEGIN');

    try {
      // Update batch_stops: status=DELIVERED, delivered_at=NOW()
      await client.query(
        `UPDATE batch_stops SET status = 'DELIVERED', delivered_at = NOW()
         WHERE id = $1`,
        [stopId]
      );

      // Update orders: status=DELIVERED
      await client.query(
        `UPDATE orders SET status = 'DELIVERED' WHERE id = $1`,
        [stop.order_id]
      );

      // Check if all stops are done (DELIVERED or FAILED)
      const { rows: pendingRows } = await client.query(
        `SELECT COUNT(*) AS pending FROM batch_stops
         WHERE batch_id = $1 AND status = 'PENDING'`,
        [stop.batch_id]
      );

      const allDone = parseInt(pendingRows[0].pending, 10) === 0;

      if (allDone) {
        await client.query(
          `UPDATE dispatch_batches SET status = 'COMPLETED', completed_at = NOW()
           WHERE id = $1`,
          [stop.batch_id]
        );

        // Remove active batch from Valkey
        try {
          await valkey.del(`emp:${req.emp.id}:active_batch`);
        } catch (vErr) {
          console.warn('Failed to clear active batch from Valkey:', vErr.message);
        }
      }

      await client.query('COMMIT');

      // Find next stop
      let next_stop_id = null;
      if (!allDone) {
        const { rows: nextRows } = await pool.query(
          `SELECT id FROM batch_stops
           WHERE batch_id = $1 AND status = 'PENDING'
           ORDER BY stop_number ASC LIMIT 1`,
          [stop.batch_id]
        );
        if (nextRows.length > 0) {
          next_stop_id = nextRows[0].id;
        }
      }

      client.release();

      res.json({
        success: true,
        message: 'Stop delivered successfully',
        data: {
          stop_id: stopId,
          status: 'DELIVERED',
          next_stop_id,
          batch_complete: allDone
        }
      });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    }
  } catch (err) {
    client.release();
    console.error('Deliver stop error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * PATCH /delivery/stops/:stopId/fail
 * Same flow as deliver but status=FAILED, save failure_reason.
 */
exports.failStop = async (req, res) => {
  const client = await pool.connect();

  try {
    const { stopId } = req.params;
    const { failure_reason } = req.body;

    if (!failure_reason) {
      client.release();
      return res.status(400).json({ success: false, message: 'failure_reason is required' });
    }

    // Fetch the stop
    const { rows: stopRows } = await client.query(
      `SELECT * FROM batch_stops WHERE id = $1`,
      [stopId]
    );

    if (stopRows.length === 0) {
      client.release();
      return res.status(404).json({ success: false, message: 'Stop not found' });
    }

    const stop = stopRows[0];

    // Verify the batch belongs to this employee
    const { rows: batchRows } = await client.query(
      `SELECT emp_id FROM dispatch_batches WHERE id = $1`,
      [stop.batch_id]
    );

    if (batchRows[0].emp_id !== req.emp.id) {
      client.release();
      return res.status(403).json({ success: false, message: 'This batch is not assigned to you' });
    }

    // Check if stop is already completed
    if (['DELIVERED', 'FAILED'].includes(stop.status)) {
      client.release();
      return res.status(400).json({ success: false, message: 'Stop already completed' });
    }

    // Sequential unlock check
    if (stop.stop_number > 1) {
      const { rows: prevRows } = await client.query(
        `SELECT status FROM batch_stops WHERE batch_id = $1 AND stop_number = $2`,
        [stop.batch_id, stop.stop_number - 1]
      );

      if (prevRows.length > 0 && !['DELIVERED', 'FAILED'].includes(prevRows[0].status)) {
        client.release();
        return res.status(403).json({
          success: false,
          message: 'Complete previous stop first'
        });
      }
    }

    // Begin transaction
    await client.query('BEGIN');

    try {
      // Update batch_stops: status=FAILED, failure_reason
      await client.query(
        `UPDATE batch_stops SET status = 'FAILED', failure_reason = $1
         WHERE id = $2`,
        [failure_reason, stopId]
      );

      // Update orders: status=FAILED
      await client.query(
        `UPDATE orders SET status = 'FAILED' WHERE id = $1`,
        [stop.order_id]
      );

      // Check if all stops are done
      const { rows: pendingRows } = await client.query(
        `SELECT COUNT(*) AS pending FROM batch_stops
         WHERE batch_id = $1 AND status = 'PENDING'`,
        [stop.batch_id]
      );

      const allDone = parseInt(pendingRows[0].pending, 10) === 0;

      if (allDone) {
        await client.query(
          `UPDATE dispatch_batches SET status = 'COMPLETED', completed_at = NOW()
           WHERE id = $1`,
          [stop.batch_id]
        );

        // Remove active batch from Valkey
        try {
          await valkey.del(`emp:${req.emp.id}:active_batch`);
        } catch (vErr) {
          console.warn('Failed to clear active batch from Valkey:', vErr.message);
        }
      }

      await client.query('COMMIT');

      // Find next stop
      let next_stop_id = null;
      if (!allDone) {
        const { rows: nextRows } = await pool.query(
          `SELECT id FROM batch_stops
           WHERE batch_id = $1 AND status = 'PENDING'
           ORDER BY stop_number ASC LIMIT 1`,
          [stop.batch_id]
        );
        if (nextRows.length > 0) {
          next_stop_id = nextRows[0].id;
        }
      }

      client.release();

      res.json({
        success: true,
        message: 'Stop marked as failed',
        data: {
          stop_id: stopId,
          status: 'FAILED',
          failure_reason,
          next_stop_id,
          batch_complete: allDone
        }
      });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    }
  } catch (err) {
    client.release();
    console.error('Fail stop error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
