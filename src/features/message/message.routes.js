const express = require('express');
const router = express.Router();
const messageController = require('./message.controller');
const authMiddleware = require('../auth/auth.middleware');

// Protect routes
router.use(authMiddleware);

router.get('/history/:leadId', messageController.getHistory);
router.post('/', messageController.create);

module.exports = router;
