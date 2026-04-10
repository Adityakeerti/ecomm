const pool = require('../utils/db');

const parsePositiveInt = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? null : parsed;
};

const parseOptionalPositiveInt = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  return parsePositiveInt(value);
};

const cityCodeFromName = (cityName) => cityName.substring(0, 3).toUpperCase();

const generateEmpId = async (cityName) => {
  const code = cityCodeFromName(cityName);
  const result = await pool.query(
    'SELECT COUNT(*) FROM delivery_staff WHERE emp_id LIKE $1',
    [`EMP-${code}-%`]
  );
  const seq = String(Number.parseInt(result.rows[0].count, 10) + 1).padStart(4, '0');
  return `EMP-${code}-${seq}`;
};

const isDev = process.env.NODE_ENV !== 'production';

/** Map common PostgreSQL errors to HTTP responses; returns true if handled. */
const respondPgError = (err, res, context) => {
  if (!err || typeof err.code !== 'string') return false;

  if (err.code === '23503') {
    res.status(400).json({
      success: false,
      message: 'Referenced record does not exist (check city_id and foreign keys)',
      ...(isDev && err.detail ? { detail: err.detail } : {}),
    });
    return true;
  }
  if (err.code === '23502') {
    res.status(400).json({
      success: false,
      message: 'A required column was null or invalid',
      ...(isDev && err.detail ? { detail: err.detail } : {}),
    });
    return true;
  }
  if (err.code === '42P01') {
    res.status(500).json({
      success: false,
      message: 'Database table not found — apply db/01_schema.sql (or run migrations)',
    });
    return true;
  }
  if (err.code === '42883' || (err.message && String(err.message).includes('gen_random_uuid'))) {
    res.status(500).json({
      success: false,
      message:
        'Database is missing UUID support. Run as superuser: CREATE EXTENSION IF NOT EXISTS pgcrypto;',
    });
    return true;
  }

  console.error(`${context}:`, err.message, err.code, err.detail);
  return false;
};

// Zones
exports.listZones = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT dz.*, c.name AS city_name, c.state AS city_state
       FROM delivery_zones dz
       JOIN cities c ON c.id = dz.city_id
       ORDER BY dz.created_at DESC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('List zones error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.createZone = async (req, res) => {
  try {
    const {
      city_id, label, center_lat, center_lng, radius_km,
      min_order_count, cutoff_time,
    } = req.body;

    if (
      city_id == null || city_id === ''
      || label == null || String(label).trim() === ''
      || center_lat == null || center_lat === ''
      || center_lng == null || center_lng === ''
      || radius_km == null || radius_km === ''
    ) {
      return res.status(400).json({
        success: false,
        message: 'city_id, label, center_lat, center_lng and radius_km are required',
      });
    }

    const parsedCityId = parsePositiveInt(city_id);
    const lat = Number(center_lat);
    const lng = Number(center_lng);
    const parsedRadius = Number.parseFloat(radius_km);
    const parsedMinOrderCount = parseOptionalPositiveInt(min_order_count);
    const minOrderFinal = parsedMinOrderCount ?? 5;
    const cutoffFinal = cutoff_time != null && String(cutoff_time).trim() !== ''
      ? String(cutoff_time).trim()
      : '14:00:00';

    if (!parsedCityId) {
      return res.status(400).json({ success: false, message: 'city_id must be a positive integer' });
    }

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ success: false, message: 'center_lat and center_lng must be valid numbers' });
    }

    if (Number.isNaN(parsedRadius) || parsedRadius <= 0) {
      return res.status(400).json({ success: false, message: 'radius_km must be a positive number' });
    }

    if (min_order_count !== undefined && min_order_count !== null && min_order_count !== '' && !parsedMinOrderCount) {
      return res.status(400).json({ success: false, message: 'min_order_count must be a positive integer' });
    }

    const labelTrimmed = String(label).trim();
    if (labelTrimmed.length > 100) {
      return res.status(400).json({ success: false, message: 'label must be at most 100 characters' });
    }

    const { rows } = await pool.query(
      `INSERT INTO delivery_zones (city_id, label, center_lat, center_lng, radius_km, min_order_count, cutoff_time)
       VALUES ($1, $2, $3::numeric, $4::numeric, $5::numeric, $6::smallint, $7::time)
       RETURNING *`,
      [parsedCityId, labelTrimmed, lat, lng, parsedRadius, minOrderFinal, cutoffFinal]
    );

    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    if (respondPgError(err, res, 'Create zone error')) return;
    console.error('Create zone error:', err);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      ...(isDev && err.message ? { detail: err.message } : {}),
    });
  }
};

exports.updateZone = async (req, res) => {
  try {
    const { id } = req.params;
    const allowedFields = [
      'city_id',
      'label',
      'center_lat',
      'center_lng',
      'radius_km',
      'min_order_count',
      'cutoff_time',
    ];

    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    for (const field of allowedFields) {
      if (req.body[field] === undefined) continue;

      let value = req.body[field];
      if (field === 'city_id' || field === 'min_order_count') {
        value = parsePositiveInt(value);
        if (!value) {
          return res.status(400).json({ success: false, message: `${field} must be a positive integer` });
        }
      }

      if (field === 'radius_km') {
        value = Number.parseFloat(value);
        if (Number.isNaN(value) || value <= 0) {
          return res.status(400).json({ success: false, message: 'radius_km must be a positive number' });
        }
      }

      setClauses.push(`${field} = $${paramIndex}`);
      values.push(value);
      paramIndex += 1;
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    values.push(id);
    const { rows, rowCount } = await pool.query(
      `UPDATE delivery_zones SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Zone not found' });
    }

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Update zone error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.toggleZone = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows, rowCount } = await pool.query(
      'UPDATE delivery_zones SET is_active = NOT is_active WHERE id = $1 RETURNING *',
      [id]
    );

    if (rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Zone not found' });
    }

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Toggle zone error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Cities
exports.listCities = async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM cities ORDER BY created_at DESC');
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('List cities error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.createCity = async (req, res) => {
  try {
    const { name, state, country } = req.body;
    if (!name || !state) {
      return res.status(400).json({ success: false, message: 'name and state are required' });
    }

    const { rows } = await pool.query(
      `INSERT INTO cities (name, state, country)
       VALUES ($1, $2, COALESCE($3, 'IN'))
       RETURNING *`,
      [name.trim(), state.trim(), country ? String(country).trim().toUpperCase() : null]
    );

    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Create city error:', err);
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'City with this name already exists' });
    }
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Categories
exports.listCategories = async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM categories ORDER BY id DESC');
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('List categories error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.createCategory = async (req, res) => {
  try {
    const { name, slug } = req.body;
    if (!name || !slug) {
      return res.status(400).json({ success: false, message: 'name and slug are required' });
    }

    const { rows } = await pool.query(
      'INSERT INTO categories (name, slug) VALUES ($1, $2) RETURNING *',
      [name.trim(), slug.trim().toLowerCase()]
    );
    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Create category error:', err);
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'Category with this name/slug already exists' });
    }
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Staff
exports.createStaff = async (req, res) => {
  const client = await pool.connect();
  try {
    const { full_name, phone_number, zone_id } = req.body;
    if (!full_name || !phone_number || !zone_id) {
      return res.status(400).json({ success: false, message: 'full_name, phone_number and zone_id are required' });
    }

    await client.query('BEGIN');

    const zoneResult = await client.query(
      `SELECT dz.id, c.name AS city_name
       FROM delivery_zones dz
       JOIN cities c ON c.id = dz.city_id
       WHERE dz.id = $1`,
      [zone_id]
    );

    if (zoneResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Zone not found' });
    }

    const cityName = zoneResult.rows[0].city_name;
    const empId = await generateEmpId(cityName);

    const staffResult = await client.query(
      `INSERT INTO delivery_staff (emp_id, full_name, phone_number, zone_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [empId, full_name, phone_number, zone_id]
    );

    await client.query('COMMIT');
    return res.status(201).json({ success: true, data: staffResult.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create staff error:', err);
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'Staff with this EMP ID already exists' });
    }
    res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    client.release();
  }
};

exports.toggleStaff = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows, rowCount } = await pool.query(
      'UPDATE delivery_staff SET is_active = NOT is_active WHERE id = $1 RETURNING *',
      [id]
    );

    if (rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Staff not found' });
    }

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Toggle staff error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getStaffHistory = async (req, res) => {
  try {
    const { id } = req.params;

    const staffResult = await pool.query(
      'SELECT id, emp_id, full_name, phone_number, zone_id, is_active FROM delivery_staff WHERE id = $1',
      [id]
    );

    if (staffResult.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Staff not found' });
    }

    const historyResult = await pool.query(
      `SELECT
          db.id AS batch_id,
          db.status AS batch_status,
          db.batch_date,
          db.dispatched_at,
          bs.id AS stop_id,
          bs.order_id,
          bs.stop_number,
          bs.status AS stop_status,
          bs.failure_reason,
          bs.delivered_at
       FROM dispatch_batches db
       LEFT JOIN batch_stops bs ON bs.batch_id = db.id
       WHERE db.emp_id = $1
       ORDER BY db.batch_date DESC, bs.stop_number ASC NULLS LAST`,
      [id]
    );

    return res.json({
      success: true,
      data: {
        staff: staffResult.rows[0],
        history: historyResult.rows,
      },
    });
  } catch (err) {
    console.error('Staff history error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
