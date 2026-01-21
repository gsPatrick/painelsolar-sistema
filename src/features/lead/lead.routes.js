const express = require('express');
const leadController = require('./lead.controller');
const { authenticate, checkReadOnly } = require('../auth/auth.middleware');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// SLA Alerts endpoint (must be before /:id to not conflict)
router.get('/sla-alerts', leadController.getSlaAlerts);
router.get('/overdue', leadController.getOverdue);

// Export endpoint for data backup (CSV download)
router.get('/export', leadController.exportCsv);

// Stats endpoint for backup page
router.get('/stats', leadController.getStats);

router.get('/', leadController.getAll);
router.get('/:id', leadController.getById);

// Apply checkReadOnly for write operations
router.post('/', checkReadOnly, leadController.create);
router.put('/:id', checkReadOnly, leadController.update);
router.put('/:id/move', checkReadOnly, leadController.move);
router.put('/:id/block', checkReadOnly, leadController.block);
router.put('/:id/restore', checkReadOnly, leadController.restore);
router.post('/reorder', checkReadOnly, leadController.reorder);
router.delete('/:id', checkReadOnly, leadController.delete);
router.post('/:id/recovery', checkReadOnly, leadController.sendDataRecovery);
router.patch('/:id/ai-status', checkReadOnly, leadController.updateAiStatus);

module.exports = router;

