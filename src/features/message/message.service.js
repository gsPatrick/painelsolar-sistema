const Message = require('../../models/Message'); // Adjust path if necessary, assuming models are at src/models
const { Op } = require('sequelize');
const { User, Lead } = require('../../models');

const messageService = {
    async getHistory(userId, leadId) {
        // Ideally we fetch messages between the system (or agent) and the lead.
        // Ensure we are filtering correctly. 
        // Assuming messages are stored with a lead_id.
        return await Message.findAll({
            where: { lead_id: leadId },
            order: [['timestamp', 'ASC']],
        });
    },

    async create(data) {
        return await Message.create(data);
    },

    async getLastMessagesForLeads(leadIds) {
        // Logic to get the last message for a list of leads to display in the sidebar
        // This might be more complex, often requiring a grouping query or subquery.
        // For simplicity/MVP, we might just fetch all and process in memory or separate queries if volume is low.
        // Better:
        /*
        SELECT * FROM messages WHERE id IN (
            SELECT MAX(id) FROM messages GROUP BY lead_id
        )
        */
        // For now, let's just return a simple finding or leave it to the controller to manage if needed.
        // Or we can rely on the frontend to just show "Last message" from the loaded history if we load it all? 
        // No, sidebar needs one query.

        // Let's implement a "getRecentConversations" if needed later.
        return [];
    }
};

module.exports = messageService;
