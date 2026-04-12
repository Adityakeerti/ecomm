const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cartController');

// Cart session endpoints (public — no auth required)
router.post('/session', cartController.createSession);
router.get('/:token', cartController.getCart);
router.post('/:token/items', cartController.addItem);
router.put('/:token/items/:variantId', cartController.updateItem);
router.delete('/:token/items/:variantId', cartController.removeItem);
router.delete('/:token', cartController.deleteCart);

module.exports = router;
