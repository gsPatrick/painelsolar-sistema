const express = require('express');
const pipelineController = require('./pipeline.controller');
const { authenticate, checkReadOnly } = require('../auth/auth.middleware');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

router.get('/', pipelineController.getAll);
router.get('/kanban', pipelineController.getKanban);
router.get('/:id', pipelineController.getById);

// Write operations
router.post('/', checkReadOnly, pipelineController.create);
router.put('/:id', checkReadOnly, pipelineController.update);
router.delete('/:id', checkReadOnly, pipelineController.delete);
router.post('/reorder', checkReadOnly, pipelineController.reorder);

module.exports = router;
