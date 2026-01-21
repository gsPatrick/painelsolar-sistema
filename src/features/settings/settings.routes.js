const express = require('express');
const router = express.Router();
const { authenticate, checkReadOnly } = require('../features/auth/auth.middleware');

// GET all settings
router.get('/', authenticate, settingsController.getAll);

// GET setting by key
router.get('/:key', authenticate, settingsController.get);

// PUT update setting
router.put('/:key', authenticate, checkReadOnly, settingsController.update);

module.exports = router;
