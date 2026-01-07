const express = require('express');
const leadController = require('./lead.controller');
const { authenticate } = require('../auth/auth.middleware');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// SLA Alerts endpoint (must be before /:id to not conflict)
router.get('/sla-alerts', leadController.getSlaAlerts);
router.get('/overdue', leadController.getOverdue);

router.get('/', leadController.getAll);
router.get('/:id', leadController.getById);
router.post('/', leadController.create);
router.put('/:id', leadController.update);
router.put('/:id/move', leadController.move);
router.put('/:id/block', leadController.block);
router.put('/:id/restore', leadController.restore);
router.post('/reorder', leadController.reorder);
router.delete('/:id', leadController.delete);

module.exports = router;

