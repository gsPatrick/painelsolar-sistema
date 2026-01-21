const express = require('express');
const taskController = require('./task.controller');
const { authenticate, checkReadOnly } = require('../auth/auth.middleware');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

router.get('/', taskController.getAll);
router.get('/today', taskController.getToday);
router.get('/overdue', taskController.getOverdue);
router.get('/:id', taskController.getById);

// Write operations
router.post('/', checkReadOnly, taskController.create);
router.put('/:id', checkReadOnly, taskController.update);
router.put('/:id/done', checkReadOnly, taskController.markAsDone);
router.delete('/:id', checkReadOnly, taskController.delete);

module.exports = router;
