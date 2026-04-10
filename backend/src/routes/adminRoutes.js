const express = require('express');
const router = express.Router();
const adminOverviewController = require('../controllers/adminOverviewController');
const adminOrdersController = require('../controllers/adminOrdersController');
const adminProductsController = require('../controllers/adminProductsController');
const adminOperationsController = require('../controllers/adminOperationsController');
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

// Zones
router.get('/zones', adminOperationsController.listZones);
router.post('/zones', adminOperationsController.createZone);
router.put('/zones/:id', adminOperationsController.updateZone);
router.patch('/zones/:id/toggle', adminOperationsController.toggleZone);

// Cities
router.get('/cities', adminOperationsController.listCities);
router.post('/cities', adminOperationsController.createCity);

// Categories
router.get('/categories', adminOperationsController.listCategories);
router.post('/categories', adminOperationsController.createCategory);

// Staff
router.post('/staff', adminOperationsController.createStaff);
router.patch('/staff/:id/toggle', adminOperationsController.toggleStaff);
router.get('/staff/:id/history', adminOperationsController.getStaffHistory);

module.exports = router;
