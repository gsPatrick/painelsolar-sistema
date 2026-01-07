const { Setting } = require('../../models');

class SettingsController {
    /**
     * GET /settings/:key
     * Get a setting by key
     */
    async get(req, res) {
        try {
            const { key } = req.params;

            let setting = await Setting.findOne({ where: { key } });

            // Return default values for known keys if not found
            if (!setting) {
                const defaults = {
                    monthly_goal: { target: 200000, current: 0 },
                    notifications: { sound: true, sla_alerts: true },
                };

                if (defaults[key]) {
                    return res.json({ key, value: defaults[key] });
                }
                return res.status(404).json({ error: 'Setting not found' });
            }

            res.json({ key: setting.key, value: setting.value });
        } catch (error) {
            console.error('Error getting setting:', error);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * PUT /settings/:key
     * Update or create a setting
     */
    async update(req, res) {
        try {
            const { key } = req.params;
            const { value, description } = req.body;

            let [setting, created] = await Setting.findOrCreate({
                where: { key },
                defaults: { value, description },
            });

            if (!created) {
                setting.value = value;
                if (description) setting.description = description;
                await setting.save();
            }

            res.json({ key: setting.key, value: setting.value, created });
        } catch (error) {
            console.error('Error updating setting:', error);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * GET /settings
     * Get all settings
     */
    async getAll(req, res) {
        try {
            const settings = await Setting.findAll();
            const result = {};
            settings.forEach(s => {
                result[s.key] = s.value;
            });
            res.json(result);
        } catch (error) {
            console.error('Error getting all settings:', error);
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new SettingsController();
