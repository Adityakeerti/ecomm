const valkey = require('../utils/valkey');
const pool = require('../utils/db');

/**
 * Delivery staff auth middleware.
 * Reads session token from `x-session-token` header,
 * looks it up in Valkey (`session:{token}` → emp_id),
 * then fetches the delivery_staff row and attaches it to `req.emp`.
 */
module.exports = async (req, res, next) => {
  const token = req.headers['x-session-token'];

  if (!token) {
    return res.status(401).json({ success: false, message: 'No session token provided' });
  }

  try {
    // Look up session in Valkey
    const empId = await valkey.get(`session:${token}`);

    if (!empId) {
      return res.status(401).json({ success: false, message: 'Invalid or expired session token' });
    }

    // Fetch the delivery_staff row by emp_id
    const { rows } = await pool.query(
      `SELECT id, emp_id, full_name, phone_number, zone_id, is_active
       FROM delivery_staff WHERE emp_id = $1`,
      [empId]
    );

    if (rows.length === 0 || !rows[0].is_active) {
      return res.status(401).json({ success: false, message: 'Employee not found or inactive' });
    }

    req.emp = rows[0];
    req.sessionToken = token;
    next();
  } catch (err) {
    console.error('empAuth middleware error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
