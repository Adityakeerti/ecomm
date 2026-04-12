const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');

// Public tracking endpoints
router.post('/lookup', orderController.lookupByPhone);
router.get('/:orderNumber', orderController.trackOrder);

module.exports = router;
