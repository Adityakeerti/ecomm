const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const adminAuthRoutes = require('./routes/adminAuthRoutes');
const adminAuth = require('./middleware/adminAuth');

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Serve test.html at /test (avoids file:// security restrictions)
app.get('/test', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'test.html'));
});

// Dev-only: execute SQL from test.html (for automated test data setup)
app.post('/test/sql', async (req, res) => {
  const pool = require('./utils/db');
  try {
    const result = await pool.query(req.body.sql, req.body.params || []);
    res.json({ success: true, data: result.rows, rowCount: result.rowCount });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Admin auth routes (login, refresh — public; logout — protected)
app.use('/admin/auth', adminAuthRoutes);

const adminRoutes = require('./routes/adminRoutes');

// Protected admin routes (require valid JWT)
app.use('/admin', adminAuth, adminRoutes);

// Delivery portal routes (session-based auth via Valkey)
const deliveryRoutes = require('./routes/deliveryRoutes');
app.use('/delivery', deliveryRoutes);

// Public storefront APIs (no auth)
app.use('/v1/products', require('./routes/products'));
app.use('/v1/zones', require('./routes/zones'));
app.use('/cart', require('./routes/cart'));
app.use('/checkout', require('./routes/checkout'));
app.use('/payments', require('./routes/payments'));
app.use('/orders', require('./routes/orders'));
app.use('/track', require('./routes/track'));
app.use('/returns', require('./routes/returns'));

// Serve test pages
app.get('/p2d1', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'p2d1_test.html'));
});
app.get('/p2d2', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'p2d2_test.html'));
});

module.exports = app;
