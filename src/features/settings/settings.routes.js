const express = require('express');
const router = express.Router();
const settingsController = require('./settings.controller');

// GET all settings
router.get('/', settingsController.getAll);

// GET setting by key
router.get('/:key', settingsController.get);

// PUT update setting
router.put('/:key', settingsController.update);

module.exports = router;
