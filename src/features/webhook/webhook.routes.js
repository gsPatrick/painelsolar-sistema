const express = require('express');
const webhookController = require('./webhook.controller');
const whatsAppService = require('../../services/WhatsAppService');

const router = express.Router();

// Z-API webhook (no auth - external service)
router.post('/z-api', (req, res) => webhookController.handleZApiWebhook(req, res));

// Meta (Facebook) webhooks
router.get('/meta', (req, res) => webhookController.verifyMetaWebhook(req, res));
router.post('/meta', (req, res) => webhookController.handleMetaWebhook(req, res));
router.post('/meta/sync', (req, res) => webhookController.syncMetaLeads(req, res));

// WhatsApp status check
router.get('/status', async (req, res) => {
    try {
        const status = await whatsAppService.checkStatus();
        res.json(status);
    } catch (error) {
        console.error('[Webhook] Status check error:', error);
        res.status(500).json({ connected: false, error: error.message });
    }
});

// Message Queue routes
const messageQueue = require('../../services/MessageQueueService');

router.get('/queue/status', (req, res) => {
    res.json(messageQueue.getStatus());
});

router.delete('/queue/clear', (req, res) => {
    const cleared = messageQueue.clearQueue();
    res.json({
        message: `Fila limpa. ${cleared} tarefas removidas.`,
        cleared
    });
});

module.exports = router;

