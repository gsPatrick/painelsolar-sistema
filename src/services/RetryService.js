const { Lead, Message, Pipeline, Op } = require('../models');
const whatsAppService = require('./WhatsAppService');

class RetryService {
    /**
     * Check for leads that need a nudge (Anti-Ghosting)
     * Rule: 
     * - Pipeline: Entrada or Primeiro Contato
     * - Last Message Sender: AI
     * - Last Interaction: > 30 minutes ago
     * - Has NOT received the nudge message yet (prevent loops)
     */
    async checkRetries() {
        console.log('[RetryService] Checking for stalled leads (Anti-Ghosting)...');

        try {
            // Define the nudge message
            const NUDGE_MESSAGE = "Ainda está por aí? Preciso dessa informação para calcular sua economia exata.";
            const THIRTY_MINUTES_AGO = new Date(Date.now() - 30 * 60 * 1000);

            // Find candidates
            const leads = await Lead.findAll({
                where: {
                    status: 'active',
                    last_interaction_at: {
                        [Op.lt]: THIRTY_MINUTES_AGO
                    },
                    // Ensure AI is active for this lead
                    [Op.or]: [
                        { ai_status: 'active' },
                        { ai_status: null }
                    ]
                },
                include: [
                    {
                        model: Pipeline,
                        as: 'pipeline',
                        where: {
                            title: {
                                [Op.or]: ['Entrada', 'Primeiro Contato']
                            }
                        }
                    },
                    {
                        model: Message,
                        as: 'messages',
                        limit: 1, // Only need the very last message
                        order: [['timestamp', 'DESC']]
                    }
                ]
            });

            let count = 0;

            for (const lead of leads) {
                const lastMessage = lead.messages && lead.messages[0];

                // 1. Check if last message was from AI
                if (!lastMessage || lastMessage.sender !== 'ai') {
                    continue;
                }

                // 2. Check if we already sent the nudge
                // We check if the LAST message is ALREADY the nudge.
                // If it is, we don't send again.
                if (lastMessage.content === NUDGE_MESSAGE) {
                    continue;
                }

                // 3. Send Nudge
                console.log(`[RetryService] Nudging lead ${lead.id} (${lead.name}) - Silent for >30m`);

                // Save to DB first to update state immediately
                await Message.create({
                    lead_id: lead.id,
                    content: NUDGE_MESSAGE,
                    sender: 'ai',
                    timestamp: new Date()
                });

                // Update lead last_interaction to prevent immediate re-check (though content check handles it)
                lead.last_interaction_at = new Date();
                await lead.save();

                // Send via WhatsApp
                await whatsAppService.sendMessage(lead.phone, NUDGE_MESSAGE, 2);

                count++;
            }

            if (count > 0) {
                console.log(`[RetryService] Sent nudges to ${count} leads.`);
            }

        } catch (error) {
            console.error('[RetryService] Error checking retries:', error);
        }
    }
}

module.exports = new RetryService();
