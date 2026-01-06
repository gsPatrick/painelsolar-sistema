const express = require('express');
const webhookController = require('./webhook.controller');

const router = express.Router();

// Z-API webhook (no auth - external service)
router.post('/z-api', (req, res) => webhookController.handleZApiWebhook(req, res));

// Meta (Facebook) webhooks
router.get('/meta', (req, res) => webhookController.verifyMetaWebhook(req, res));
router.post('/meta', (req, res) => webhookController.handleMetaWebhook(req, res));

module.exports = router;
