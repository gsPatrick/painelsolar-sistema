const { SystemSettings } = require('../../models');

class SystemSettingsController {
    /**
     * GET /system-settings
     * Get all settings
     */
    async getAll(req, res) {
        try {
            const settings = await SystemSettings.findAll();

            // Convert to key-value object for easier frontend consumption
            const settingsObject = {};
            settings.forEach(s => {
                let value = s.value;
                // Parse based on type
                if (s.type === 'number') {
                    value = parseFloat(s.value) || 0;
                } else if (s.type === 'boolean') {
                    value = s.value === 'true';
                } else if (s.type === 'json') {
                    try {
                        value = JSON.parse(s.value);
                    } catch (e) {
                        value = {};
                    }
                }
                settingsObject[s.key] = {
                    value,
                    type: s.type,
                    description: s.description,
                };
            });

            res.status(200).json(settingsObject);
        } catch (error) {
            console.error('[SystemSettings] Get all error:', error.message);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * GET /system-settings/:key
     * Get a specific setting by key
     */
    async getByKey(req, res) {
        try {
            const setting = await SystemSettings.findOne({
                where: { key: req.params.key }
            });

            if (!setting) {
                return res.status(404).json({ error: 'Setting not found' });
            }

            res.status(200).json(setting);
        } catch (error) {
            console.error('[SystemSettings] Get by key error:', error.message);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * PUT /system-settings/:key
     * Update a specific setting
     */
    async update(req, res) {
        try {
            const { value } = req.body;

            const [updated] = await SystemSettings.update(
                { value: String(value) },
                { where: { key: req.params.key } }
            );

            if (updated === 0) {
                return res.status(404).json({ error: 'Setting not found' });
            }

            const setting = await SystemSettings.findOne({
                where: { key: req.params.key }
            });

            console.log(`[SystemSettings] Updated: ${req.params.key}`);
            res.status(200).json(setting);
        } catch (error) {
            console.error('[SystemSettings] Update error:', error.message);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * PUT /system-settings (bulk update)
     * Update multiple settings at once
     */
    async bulkUpdate(req, res) {
        try {
            const updates = req.body; // { key1: value1, key2: value2, ... }

            const results = [];
            for (const [key, value] of Object.entries(updates)) {
                await SystemSettings.update(
                    { value: String(value) },
                    { where: { key } }
                );
                results.push({ key, value });
            }

            console.log(`[SystemSettings] Bulk updated ${results.length} settings`);
            res.status(200).json({ updated: results });
        } catch (error) {
            console.error('[SystemSettings] Bulk update error:', error.message);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * POST /system-settings/seed
     * Seed default settings (admin only)
     */
    async seed(req, res) {
        try {
            await SystemSettings.seedDefaults();
            res.status(200).json({ message: 'Default settings seeded' });
        } catch (error) {
            console.error('[SystemSettings] Seed error:', error.message);
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new SystemSettingsController();
