const express = require('express');
const router = express.Router();
const checkoutController = require('../controllers/checkoutController');
const webhookController = require('../controllers/webhookController');

// Public payment endpoints
router.post('/initiate', checkoutController.initiatePayment);

// PhonePe webhook — PhonePe calls this after every payment event
router.post('/webhook', webhookController.handleWebhook);

// DEV ONLY: generate a valid signed payload for webhook testing
// Remove before production!
router.post('/test-signature', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ message: 'Not found' });
  }
  const result = webhookController.generateTestSignature(req.body);
  res.json(result);
});

module.exports = router;
