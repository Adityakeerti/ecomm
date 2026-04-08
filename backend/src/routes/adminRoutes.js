const express = require('express');
const router = express.Router();
const adminOverviewController = require('../controllers/adminOverviewController');
const adminOrdersController = require('../controllers/adminOrdersController');

// Overview
router.get('/overview', adminOverviewController.getOverview);

// Orders
router.get('/orders', adminOrdersController.listOrders);
router.get('/orders/:id', adminOrdersController.getOrderDetails);
router.patch('/orders/:id/status', adminOrdersController.updateOrderStatus);

module.exports = router;
