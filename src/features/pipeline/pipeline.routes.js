const express = require('express');
const pipelineController = require('./pipeline.controller');
const { authenticate } = require('../auth/auth.middleware');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

router.get('/', pipelineController.getAll);
router.get('/kanban', pipelineController.getKanban);
router.get('/:id', pipelineController.getById);
router.post('/', pipelineController.create);
router.put('/:id', pipelineController.update);
router.delete('/:id', pipelineController.delete);
router.post('/reorder', pipelineController.reorder);

module.exports = router;
