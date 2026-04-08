const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const adminAuthController = require('../controllers/adminAuthController');

// Public routes (no JWT required)
router.post('/login', adminAuthController.login);
router.post('/refresh', adminAuthController.refresh);

// Protected routes (JWT required)
router.post('/logout', adminAuth, adminAuthController.logout);

module.exports = router;
