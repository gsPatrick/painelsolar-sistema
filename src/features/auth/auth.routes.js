const express = require('express');
const authController = require('./auth.controller');
const { authenticate, authorize } = require('./auth.middleware');

const router = express.Router();

// Public routes
router.post('/login', authController.login);

// Protected routes
router.get('/me', authenticate, authController.me);
router.put('/me', authenticate, authController.updateMe);

// Admin only routes
router.post('/register', authenticate, authorize('admin'), authController.register);
router.get('/users', authenticate, authorize('admin'), authController.index);
router.put('/users/:id', authenticate, authorize('admin'), authController.updateUser);
router.delete('/users/:id', authenticate, authorize('admin'), authController.deleteUser);

module.exports = router;
