const express = require('express');
const router = express.Router();
const checkoutController = require('../controllers/checkoutController');

// Public checkout endpoints (no auth — customers use these)
router.post('/validate', checkoutController.validateCheckout);

module.exports = router;
