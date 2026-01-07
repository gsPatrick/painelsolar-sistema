const express = require('express');
const path = require('path');

// Import feature routes
const authRoutes = require('../features/auth/auth.routes');
const pipelineRoutes = require('../features/pipeline/pipeline.routes');
const leadRoutes = require('../features/lead/lead.routes');
const taskRoutes = require('../features/task/task.routes');
const appointmentRoutes = require('../features/appointment/appointment.routes');
const webhookRoutes = require('../features/webhook/webhook.routes');
const messageRoutes = require('../features/message/message.routes');
const settingsRoutes = require('../features/settings/settings.routes');
const systemSettingsRoutes = require('../features/settings/systemSettings.routes');
const followupRoutes = require('../features/followup/followup.routes');

const router = express.Router();

// Mount routes
router.use('/auth', authRoutes);
router.use('/pipelines', pipelineRoutes);
router.use('/leads', leadRoutes);
router.use('/tasks', taskRoutes);
router.use('/appointments', appointmentRoutes);
router.use('/messages', messageRoutes);
router.use('/webhook', webhookRoutes);
router.use('/settings', settingsRoutes);
router.use('/system-settings', systemSettingsRoutes);
router.use('/followup', followupRoutes);

// Serve video files from src/video directory
router.get('/video/prova-social.mp4', (req, res) => {
    const videoPath = path.join(__dirname, '../video/WhatsApp Video 2026-01-06 at 18.47.04.mp4');
    res.sendFile(videoPath);
});

module.exports = router;


