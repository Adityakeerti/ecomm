const express = require('express');
const router = express.Router();
const zoneController = require('../controllers/zoneController');

// Public zone endpoints (no auth required)
router.post('/validate', zoneController.validateZone);

module.exports = router;
