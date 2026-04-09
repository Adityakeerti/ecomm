const express = require('express');
const router = express.Router();
const adminOverviewController = require('../controllers/adminOverviewController');
const adminOrdersController = require('../controllers/adminOrdersController');
const adminProductsController = require('../controllers/adminProductsController');
const upload = require('../middleware/upload');

// Overview
router.get('/overview', adminOverviewController.getOverview);

// Orders
router.get('/orders', adminOrdersController.listOrders);
router.get('/orders/:id', adminOrdersController.getOrderDetails);
router.patch('/orders/:id/status', adminOrdersController.updateOrderStatus);

// Products
router.post('/products', upload.single('image'), adminProductsController.createProduct);
router.put('/products/:id', upload.single('image'), adminProductsController.updateProduct);
router.patch('/products/:id/toggle', adminProductsController.toggleActive);

// Product Variants
router.post('/products/:id/variants', adminProductsController.addVariant);

// Inventory
router.patch('/inventory/:variantId/restock', adminProductsController.restockInventory);

module.exports = router;
