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

// Admin auth routes (login, refresh — public; logout — protected)
app.use('/admin/auth', adminAuthRoutes);

const adminRoutes = require('./routes/adminRoutes');

// Protected admin routes (require valid JWT)
app.use('/admin', adminAuth, adminRoutes);

module.exports = app;
