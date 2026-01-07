const express = require('express');
const router = express.Router();
const systemSettingsController = require('./systemSettings.controller');
const authMiddleware = require('../../middlewares/auth');

// All routes require authentication
router.use(authMiddleware);

// GET all settings
router.get('/', systemSettingsController.getAll);

// GET specific setting by key
router.get('/:key', systemSettingsController.getByKey);

// PUT update specific setting
router.put('/:key', systemSettingsController.update);

// PUT bulk update multiple settings
router.put('/', systemSettingsController.bulkUpdate);

// POST seed defaults (admin only)
router.post('/seed', systemSettingsController.seed);

module.exports = router;
