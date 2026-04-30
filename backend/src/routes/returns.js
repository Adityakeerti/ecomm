const express = require('express');
const router = express.Router();
const returnsController = require('../controllers/returnsController');
const userAuth = require('../middleware/userAuth');

// Public returns endpoints
router.get('/eligible-orders', userAuth, returnsController.getEligibleOrders);
router.get('/my-requests', userAuth, returnsController.listMyReturns);
router.post('/', userAuth, returnsController.createReturn);
router.get('/:returnId', returnsController.getReturn);

module.exports = router;
