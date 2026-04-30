const express = require('express');
const router = express.Router();
const userAuth = require('../middleware/userAuth');
const userAuthController = require('../controllers/userAuthController');

// Public routes
router.post('/register', userAuthController.register);
router.post('/login',    userAuthController.login);
router.post('/refresh',  userAuthController.refresh);

// Protected routes (valid user JWT required)
router.post('/logout',   userAuth, userAuthController.logout);
router.get('/me',        userAuth, userAuthController.me);
router.patch('/me',      userAuth, userAuthController.updateMe);

module.exports = router;
