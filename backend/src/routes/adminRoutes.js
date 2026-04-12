const express = require('express');
const router = express.Router();
const adminOverviewController = require('../controllers/adminOverviewController');
const adminOrdersController = require('../controllers/adminOrdersController');
const adminProductsController = require('../controllers/adminProductsController');
const adminDispatchController = require('../controllers/adminDispatchController');
const adminReturnsController = require('../controllers/adminReturnsController');
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

// Dispatch
router.get('/dispatch/ready', adminDispatchController.getDispatchReady);
router.post('/dispatch/batches/:id/assign', adminDispatchController.assignBatch);
router.post('/dispatch/batches/:id/dispatch', adminDispatchController.dispatchBatch);

// Returns
router.get('/returns', adminReturnsController.listReturns);
router.patch('/returns/:id', adminReturnsController.updateReturn);

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

// System / Utils
const emailService = require('../services/emailService');
router.post('/test-email', async (req, res) => {
  try {
    const { to } = req.body;
    if (!to) return res.status(400).json({ success: false, message: 'to email is required' });
    const result = await emailService.sendTestEmail(to);
    if (result.sent) {
      return res.json({ success: true, message: 'Test email sent successfully' });
    } else {
      return res.status(400).json({ success: false, message: result.reason });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
