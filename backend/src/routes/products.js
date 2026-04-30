const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');

// Public product endpoints (no auth required)
router.get('/', productController.getProducts);
router.get('/categories', productController.getCategories);
router.get('/:slug/variants', productController.getVariantsBySlug);
router.get('/:slug', productController.getProductBySlug);

module.exports = router;
