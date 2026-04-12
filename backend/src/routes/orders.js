const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');

// Public order endpoints (no auth — customers use these)
router.get('/:orderNumber/confirmation', orderController.getConfirmation);

module.exports = router;
