const { v4: uuidv4 } = require('uuid');
const pool = require('../utils/db');
const valkey = require('../utils/valkey');

const SESSION_TTL = 43200; // 12 hours in seconds

/**
 * POST /delivery/auth/login
 * Body: { emp_id }
 * Find delivery_staff by emp_id, verify is_active=true.
 * Store session in Valkey: SET session:{uuid_token} {emp_id} EX 43200
 * Return session_token (stored in sessionStorage on client side).
 */
exports.login = async (req, res) => {
  try {
    const { emp_id, pin } = req.body;

    if (!emp_id) {
      return res.status(400).json({ success: false, message: 'emp_id is required' });
    }

    const requiredPin = process.env.DELIVERY_LOGIN_PIN;
    if (requiredPin && String(pin || '') !== requiredPin) {
      return res.status(401).json({ success: false, message: 'Invalid delivery login pin' });
    }

    // Find delivery staff by emp_id
    const { rows } = await pool.query(
      `SELECT id, emp_id, full_name, phone_number, zone_id, is_active
       FROM delivery_staff WHERE emp_id = $1`,
      [emp_id]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid employee ID' });
    }

    const staff = rows[0];

    if (!staff.is_active) {
      return res.status(401).json({
        success: false,
        message: 'Employee account is inactive. Contact admin.'
      });
    }

    // Generate session token and store in Valkey
    const sessionToken = uuidv4();
    await valkey.set(`session:${sessionToken}`, emp_id, 'EX', SESSION_TTL);

    res.json({
      success: true,
      session_token: sessionToken,
      employee: {
        id: staff.id,
        emp_id: staff.emp_id,
        full_name: staff.full_name,
        zone_id: staff.zone_id
      }
    });
  } catch (err) {
    console.error('Delivery login error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * POST /delivery/auth/logout
 * Deletes the session from Valkey.
 * Requires empAuth middleware.
 */
exports.logout = async (req, res) => {
  try {
    if (req.sessionToken) {
      await valkey.del(`session:${req.sessionToken}`);
    }
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    console.error('Delivery logout error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
