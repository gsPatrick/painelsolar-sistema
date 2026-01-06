const express = require('express');

// Import feature routes
const authRoutes = require('../features/auth/auth.routes');
const pipelineRoutes = require('../features/pipeline/pipeline.routes');
const leadRoutes = require('../features/lead/lead.routes');
const taskRoutes = require('../features/task/task.routes');
const appointmentRoutes = require('../features/appointment/appointment.routes');
const webhookRoutes = require('../features/webhook/webhook.routes');
const messageRoutes = require('../features/message/message.routes');

const router = express.Router();

// Mount routes
router.use('/auth', authRoutes);
router.use('/pipelines', pipelineRoutes);
router.use('/leads', leadRoutes);
router.use('/tasks', taskRoutes);
router.use('/appointments', appointmentRoutes);
router.use('/messages', messageRoutes);
router.use('/webhook', webhookRoutes);

module.exports = router;
