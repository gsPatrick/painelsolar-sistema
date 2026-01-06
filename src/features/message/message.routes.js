const express = require('express');
const router = express.Router();
const messageController = require('./message.controller');
const { authenticate } = require('../auth/auth.middleware');

// Protect routes
router.use(authenticate);

router.get('/history/:leadId', messageController.getHistory);
router.post('/', messageController.create);

module.exports = router;
