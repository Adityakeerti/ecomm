const express = require('express');
const router = express.Router();
const returnsController = require('../controllers/returnsController');

// Public returns endpoints
router.post('/', returnsController.createReturn);
router.get('/:returnId', returnsController.getReturn);

module.exports = router;
