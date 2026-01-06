const express = require('express');
const appointmentController = require('./appointment.controller');
const { authenticate } = require('../auth/auth.middleware');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

router.get('/', appointmentController.getAll);
router.get('/today', appointmentController.getToday);
router.get('/upcoming', appointmentController.getUpcoming);
router.get('/:id', appointmentController.getById);
router.post('/', appointmentController.create);
router.put('/:id', appointmentController.update);
router.put('/:id/cancel', appointmentController.cancel);
router.put('/:id/complete', appointmentController.complete);
router.delete('/:id', appointmentController.delete);

module.exports = router;
