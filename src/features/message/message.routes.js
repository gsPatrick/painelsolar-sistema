const express = require('express');
const router = express.Router();
const messageController = require('./message.controller');
const { authenticate } = require('../auth/auth.middleware');

const upload = require('../../middleware/upload');

// Protect routes
router.use(authenticate);

router.get('/history/:leadId', messageController.getHistory);
router.post('/', messageController.create);
router.post('/media', upload.single('file'), messageController.createWithMedia);
router.post('/bulk', messageController.bulkSend);

module.exports = router;
