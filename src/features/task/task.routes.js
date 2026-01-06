const express = require('express');
const taskController = require('./task.controller');
const { authenticate } = require('../auth/auth.middleware');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

router.get('/', taskController.getAll);
router.get('/today', taskController.getToday);
router.get('/overdue', taskController.getOverdue);
router.get('/:id', taskController.getById);
router.post('/', taskController.create);
router.put('/:id', taskController.update);
router.put('/:id/done', taskController.markAsDone);
router.delete('/:id', taskController.delete);

module.exports = router;
