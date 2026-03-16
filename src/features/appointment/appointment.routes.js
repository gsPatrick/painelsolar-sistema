const express = require('express');
const appointmentController = require('./appointment.controller');
const { authenticate, checkReadOnly } = require('../auth/auth.middleware');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

router.get('/', appointmentController.getAll);
router.get('/today', appointmentController.getToday);
router.get('/upcoming', appointmentController.getUpcoming);
router.get('/:id', appointmentController.getById);

// Write operations
router.post('/', checkReadOnly, appointmentController.create);
router.put('/:id', checkReadOnly, appointmentController.update);
router.put('/:id/cancel', checkReadOnly, appointmentController.cancel);
router.put('/:id/complete', checkReadOnly, appointmentController.complete);
router.delete('/:id', checkReadOnly, appointmentController.delete);

module.exports = router;
