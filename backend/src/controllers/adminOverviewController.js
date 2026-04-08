const pool = require('../utils/db');

exports.getOverview = async (req, res) => {
  try {
    const [ordersRes, revenueRes, pendingRes, dispatchedRes, zonesRes] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM orders WHERE created_at::date = CURRENT_DATE"),
      pool.query("SELECT SUM(total_paise) FROM orders WHERE paid_at::date = CURRENT_DATE"),
      pool.query("SELECT COUNT(*) FROM orders WHERE status='PENDING'"),
      pool.query("SELECT COUNT(*) FROM orders WHERE status='DISPATCHED'"),
      pool.query("SELECT COUNT(*) FROM v_dispatch_ready"),
    ]);

    const stats = {
      ordersToday: parseInt(ordersRes.rows[0].count, 10) || 0,
      revenueTodayPaise: parseInt(revenueRes.rows[0].sum, 10) || 0,
      pendingOrders: parseInt(pendingRes.rows[0].count, 10) || 0,
      dispatchedOrders: parseInt(dispatchedRes.rows[0].count, 10) || 0,
      dispatchReadyZones: parseInt(zonesRes.rows[0].count, 10) || 0,
    };

    res.json({ success: true, stats });
  } catch (err) {
    console.error('Overview error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
