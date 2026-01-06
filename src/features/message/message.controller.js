const messageService = require('./message.service');

const messageController = {
    async getHistory(req, res) {
        try {
            const { leadId } = req.params;
            const history = await messageService.getHistory(req.user.id, leadId);
            res.json(history);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to fetch message history' });
        }
    },

    async create(req, res) {
        try {
            const { lead_id, content, sender } = req.body;
            const message = await messageService.create({
                lead_id,
                content,
                sender, // 'user' (lead) or 'ai' (system/agent)
                timestamp: new Date()
            });
            res.status(201).json(message);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to save message' });
        }
    }
};

module.exports = messageController;
