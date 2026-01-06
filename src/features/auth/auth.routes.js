const express = require('express');
const authController = require('./auth.controller');
const { authenticate } = require('./auth.middleware');

const router = express.Router();

// Public routes
router.post('/register', authController.register);
router.post('/login', authController.login);

// Protected routes
router.get('/me', authenticate, authController.me);
router.put('/me', authenticate, authController.updateMe);

module.exports = router;
