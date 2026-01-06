const express = require('express');
const webhookController = require('./webhook.controller');

const router = express.Router();

// Z-API webhook (no auth - external service)
router.post('/z-api', webhookController.handleZApiWebhook);

// Meta (Facebook) webhooks
router.get('/meta', webhookController.verifyMetaWebhook);
router.post('/meta', webhookController.handleMetaWebhook);

module.exports = router;
