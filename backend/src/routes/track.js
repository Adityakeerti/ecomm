const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const userAuth = require('../middleware/userAuth');

// Public tracking endpoints
router.post('/lookup', orderController.lookupByPhone);
router.get('/my-orders/list', userAuth, orderController.listMyOrders);
router.get('/my-orders/:orderNumber', userAuth, orderController.trackMyOrder);
router.get('/:orderNumber', orderController.trackOrder);

module.exports = router;
