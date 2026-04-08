const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const pool = require('../utils/db');
const valkey = require('../utils/valkey');

const ACCESS_TOKEN_EXPIRY = '8h';
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

/**
 * POST /admin/auth/login
 * Body: { username, password }
 */
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }

    // Find admin by username
    const { rows } = await pool.query(
      'SELECT id, username, password_hash FROM admins WHERE username = $1',
      [username]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const admin = rows[0];

    // Compare password with stored hash
    const isMatch = await bcrypt.compare(password, admin.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Sign JWT access token
    const accessToken = jwt.sign(
      { adminId: admin.id, username: admin.username, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRY }
    );

    // Generate refresh token (random UUID) and store in Valkey with 7-day TTL
    const refreshToken = uuidv4();
    await valkey.set(
      `refresh:${refreshToken}`,
      JSON.stringify({ adminId: admin.id, username: admin.username }),
      'EX',
      REFRESH_TOKEN_TTL
    );

    res.json({
      success: true,
      accessToken,
      refreshToken,
      admin: { id: admin.id, username: admin.username },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * POST /admin/auth/refresh
 * Body: { refreshToken }
 */
exports.refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ success: false, message: 'Refresh token is required' });
    }

    // Look up refresh token in Valkey
    const data = await valkey.get(`refresh:${refreshToken}`);
    if (!data) {
      return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
    }

    const { adminId, username } = JSON.parse(data);

    // Delete the old refresh token (rotate)
    await valkey.del(`refresh:${refreshToken}`);

    // Issue a new access token
    const accessToken = jwt.sign(
      { adminId, username, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRY }
    );

    // Issue a new refresh token
    const newRefreshToken = uuidv4();
    await valkey.set(
      `refresh:${newRefreshToken}`,
      JSON.stringify({ adminId, username }),
      'EX',
      REFRESH_TOKEN_TTL
    );

    res.json({
      success: true,
      accessToken,
      refreshToken: newRefreshToken,
    });
  } catch (err) {
    console.error('Refresh error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * POST /admin/auth/logout
 * Body: { refreshToken }
 */
exports.logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      await valkey.del(`refresh:${refreshToken}`);
    }

    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
