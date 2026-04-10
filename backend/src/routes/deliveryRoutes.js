const express = require('express');
const router = express.Router();
const empAuth = require('../middleware/empAuth');
const deliveryAuthController = require('../controllers/deliveryAuthController');
const deliveryBatchController = require('../controllers/deliveryBatchController');

// Public routes (no session required)
router.post('/auth/login', deliveryAuthController.login);

// Protected routes (session token required)
router.post('/auth/logout', empAuth, deliveryAuthController.logout);
router.get('/batch/active', empAuth, deliveryBatchController.getActiveBatch);
router.get('/batch/:batchId/stops', empAuth, deliveryBatchController.getBatchStops);
router.patch('/stops/:stopId/deliver', empAuth, deliveryBatchController.deliverStop);
router.patch('/stops/:stopId/fail', empAuth, deliveryBatchController.failStop);

module.exports = router;
