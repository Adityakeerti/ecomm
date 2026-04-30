const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

const adminAuthRoutes = require('./routes/adminAuthRoutes');
const adminAuth = require('./middleware/adminAuth');
const userAuthRoutes = require('./routes/userAuthRoutes');

const app = express();
const isDev = process.env.NODE_ENV !== 'production';

app.use(helmet({ contentSecurityPolicy: false }));
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.length > 0 && allowedOrigins.includes(origin)) return cb(null, true);
    if (allowedOrigins.length === 0 && isDev && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return cb(null, true);
    }
    return cb(new Error('CORS origin not allowed'));
  },
  allowedHeaders: ['Content-Type', 'Authorization', 'x-session-token'],
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
}));
app.use(morgan('dev'));
app.use(express.json());

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts, please retry later.' },
});

const sessionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please retry in a minute.' },
});
const deliveryLoginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many delivery login attempts, please retry later.' },
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

if (isDev && process.env.ENABLE_TEST_ROUTES === 'true') {
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
}

// Admin auth routes (login, refresh — public; logout — protected)
app.use('/admin/auth/login', loginLimiter);
app.use('/admin/auth', adminAuthRoutes);
app.use('/auth/login', loginLimiter);
app.use('/auth', userAuthRoutes);

const adminRoutes = require('./routes/adminRoutes');

// Protected admin routes (require valid JWT)
app.use('/admin', adminAuth, adminRoutes);

// Delivery portal routes (session-based auth via Valkey)
const deliveryRoutes = require('./routes/deliveryRoutes');
app.use('/delivery/auth/login', deliveryLoginLimiter);
app.use('/delivery', deliveryRoutes);

// Public storefront APIs (no auth)
app.use('/v1/products', require('./routes/products'));
app.use('/v1/categories', require('./routes/categories'));
app.use('/v1/zones', require('./routes/zones'));
app.use('/cart/session', sessionLimiter);
app.use('/cart', require('./routes/cart'));
app.use('/checkout', require('./routes/checkout'));
app.use('/payments/initiate', sessionLimiter);
app.use('/payments', require('./routes/payments'));
app.use('/orders', require('./routes/orders'));
app.use('/track', require('./routes/track'));
app.use('/returns', require('./routes/returns'));

if (isDev && process.env.ENABLE_TEST_ROUTES === 'true') {
  // Serve test pages
  app.get('/p2d1', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'p2d1_test.html'));
  });
  app.get('/p2d2', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'p2d2_test.html'));
  });
}

module.exports = app;
