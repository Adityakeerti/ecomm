const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const pool = require('../utils/db');
const valkey = require('../utils/valkey');

const ACCESS_TOKEN_EXPIRY = '8h';
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days in seconds
const SALT_ROUNDS = 12;

/** Normalise phone → +91XXXXXXXXXX, returns null if invalid */
function normalisePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return null;
}

/**
 * POST /auth/register
 * Body: { email, password, full_name, phone? }
 */
exports.register = async (req, res) => {
  try {
    const { email, password, full_name, phone } = req.body;

    // Validation
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: 'Valid email is required' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    }
    if (!full_name || full_name.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Full name is required (min 2 chars)' });
    }

    const normalisedPhone = phone ? normalisePhone(phone) : null;
    if (phone && !normalisedPhone) {
      return res.status(400).json({ success: false, message: 'Invalid phone number. Use a 10-digit Indian mobile number.' });
    }

    // Check if email already registered
    const existing = await pool.query('SELECT id FROM customers WHERE LOWER(email) = LOWER($1)', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists' });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    // Insert user
    const { rows } = await pool.query(
      `INSERT INTO customers (email, password_hash, full_name, phone_number)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, full_name, phone_number, created_at`,
      [email.toLowerCase(), password_hash, full_name.trim(), normalisedPhone]
    );

    const user = rows[0];

    // Issue tokens
    const accessToken = jwt.sign(
      { userId: user.id, email: user.email, role: 'user' },
      process.env.JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRY }
    );

    const refreshToken = uuidv4();
    await valkey.set(
      `user_refresh:${refreshToken}`,
      JSON.stringify({ userId: user.id, email: user.email }),
      'EX',
      REFRESH_TOKEN_TTL
    );

    return res.status(201).json({
      success: true,
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, full_name: user.full_name },
    });
  } catch (err) {
    console.error('User register error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * POST /auth/login
 * Body: { email, password }
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const { rows } = await pool.query(
      'SELECT id, email, password_hash, full_name FROM customers WHERE LOWER(email) = LOWER($1)',
      [email.toLowerCase()]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const accessToken = jwt.sign(
      { userId: user.id, email: user.email, role: 'user' },
      process.env.JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRY }
    );

    const refreshToken = uuidv4();
    await valkey.set(
      `user_refresh:${refreshToken}`,
      JSON.stringify({ userId: user.id, email: user.email }),
      'EX',
      REFRESH_TOKEN_TTL
    );

    return res.json({
      success: true,
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, full_name: user.full_name },
    });
  } catch (err) {
    console.error('User login error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * POST /auth/refresh
 * Body: { refreshToken }
 */
exports.refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: 'Refresh token is required' });
    }

    const data = await valkey.get(`user_refresh:${refreshToken}`);
    if (!data) {
      return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
    }

    const { userId, email } = JSON.parse(data);

    // Rotate refresh token
    await valkey.del(`user_refresh:${refreshToken}`);

    const accessToken = jwt.sign(
      { userId, email, role: 'user' },
      process.env.JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRY }
    );

    const newRefreshToken = uuidv4();
    await valkey.set(
      `user_refresh:${newRefreshToken}`,
      JSON.stringify({ userId, email }),
      'EX',
      REFRESH_TOKEN_TTL
    );

    return res.json({ success: true, accessToken, refreshToken: newRefreshToken });
  } catch (err) {
    console.error('User refresh error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * POST /auth/logout
 * Body: { refreshToken }
 * Header: Authorization: Bearer <accessToken>  (validated by userAuth middleware)
 */
exports.logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await valkey.del(`user_refresh:${refreshToken}`);
    }
    return res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    console.error('User logout error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * GET /auth/me
 * Protected — requires valid user JWT
 */
exports.me = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, email, full_name, phone_number AS phone, created_at, saved_addresses
       FROM customers
       WHERE id = $1`,
      [req.user.userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('User me error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * PATCH /auth/me
 * Body:
 *  {
 *    full_name?, phone?,
 *    add_address?: { full_name, phone, email, address_line, pincode?, lat?, lng?, label? }
 *    remove_address_index?: number  — index in saved_addresses to remove
 *  }
 */
exports.updateMe = async (req, res) => {
  try {
    const { full_name, phone, add_address, remove_address_index } = req.body || {};
    const normalizedPhone = phone ? normalisePhone(phone) : null;
    if (phone && !normalizedPhone) {
      return res.status(400).json({ success: false, message: 'Invalid phone number' });
    }

    const { rows: currentRows } = await pool.query(
      `SELECT id, email, full_name, phone_number, saved_addresses
       FROM customers
       WHERE id = $1`,
      [req.user.userId]
    );
    if (currentRows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const current = currentRows[0];
    let savedAddresses = Array.isArray(current.saved_addresses) ? current.saved_addresses : [];

    if (add_address && typeof add_address === 'object') {
      const candidate = {
        label: String(add_address.label || '').trim() || 'Saved Address',
        full_name: String(add_address.full_name || full_name || current.full_name || '').trim(),
        phone: String(add_address.phone || phone || current.phone_number || '').trim(),
        email: String(add_address.email || current.email || '').trim(),
        address_line: String(add_address.address_line || '').trim(),
        landmark: String(add_address.landmark || '').trim() || null,
        pincode: String(add_address.pincode || '').trim(),
        lat: add_address.lat != null ? Number(add_address.lat) : null,
        lng: add_address.lng != null ? Number(add_address.lng) : null,
      };
      if (candidate.address_line) {
        const exists = savedAddresses.some(
          (a) =>
            String(a.address_line || '').trim().toLowerCase() === candidate.address_line.toLowerCase() &&
            String(a.pincode || '').trim() === candidate.pincode
        );
        if (!exists) savedAddresses = [candidate, ...savedAddresses].slice(0, 20);
      }
    }

    if (remove_address_index != null && !isNaN(Number(remove_address_index))) {
      const idx = Number(remove_address_index);
      if (idx >= 0 && idx < savedAddresses.length) {
        savedAddresses = savedAddresses.filter((_, i) => i !== idx);
      }
    }

    const { rows } = await pool.query(
      `UPDATE customers
       SET full_name = COALESCE($1, full_name),
           phone_number = COALESCE($2, phone_number),
           saved_addresses = $3::jsonb
       WHERE id = $4
       RETURNING id, email, full_name, phone_number AS phone, created_at, saved_addresses`,
      [full_name?.trim() || null, normalizedPhone, JSON.stringify(savedAddresses), req.user.userId]
    );

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('User updateMe error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
