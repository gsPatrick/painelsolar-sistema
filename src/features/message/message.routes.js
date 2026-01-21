const express = require('express');
const router = express.Router();
const messageController = require('./message.controller');
const { authenticate, checkReadOnly } = require('../auth/auth.middleware');

const upload = require('../../middleware/upload');

// Protect routes
router.use(authenticate);

router.get('/history/:leadId', messageController.getHistory);

// Write operations
router.post('/', checkReadOnly, messageController.create);
router.post('/media', checkReadOnly, upload.single('file'), messageController.createWithMedia);
router.post('/bulk', checkReadOnly, messageController.bulkSend);
router.get('/bulk/status', messageController.getBulkStatus);
router.post('/bulk/stop', checkReadOnly, messageController.stopBulkSend);

module.exports = router;
