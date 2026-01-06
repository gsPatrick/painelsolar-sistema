const express = require('express');
const leadController = require('./lead.controller');
const { authenticate } = require('../auth/auth.middleware');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

router.get('/', leadController.getAll);
router.get('/overdue', leadController.getOverdue);
router.get('/:id', leadController.getById);
router.post('/', leadController.create);
router.put('/:id', leadController.update);
router.put('/:id/move', leadController.move);
router.post('/reorder', leadController.reorder);
router.delete('/:id', leadController.delete);

module.exports = router;
