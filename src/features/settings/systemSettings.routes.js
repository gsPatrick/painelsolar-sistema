const express = require('express');
const router = express.Router();
const systemSettingsController = require('./systemSettings.controller');
const { authenticate, checkReadOnly } = require('../auth/auth.middleware');

// All routes require authentication
router.use(authenticate);

// GET all settings
router.get('/', systemSettingsController.getAll);

// GET specific setting by key
router.get('/:key', systemSettingsController.getByKey);

// Write operations
router.put('/:key', checkReadOnly, systemSettingsController.update);
router.put('/', checkReadOnly, systemSettingsController.bulkUpdate);
router.post('/seed', checkReadOnly, systemSettingsController.seed);

module.exports = router;
