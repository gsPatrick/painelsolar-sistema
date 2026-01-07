const { Lead, Message, SystemSettings } = require('../models');
const { Op } = require('sequelize');
const whatsAppService = require('./WhatsAppService');

class FollowUpService {
    constructor() {
        this.defaultDelayHours = 24;
        this.maxFollowups = 3;
    }

    /**
     * Get global follow-up settings from SystemSettings
     */
    async getSettings() {
        try {
            const [delayHours, defaultMessage] = await Promise.all([
                SystemSettings.findOne({ where: { key: 'followup_delay_hours' } }),
                SystemSettings.findOne({ where: { key: 'followup_message' } }),
            ]);

            return {
                delayHours: delayHours ? parseInt(delayHours.value) : this.defaultDelayHours,
                defaultMessage: defaultMessage?.value || 'Olá! Tudo bem? 😊 Passando para saber se conseguiu avaliar nossa proposta. Ficou com alguma dúvida? Estou à disposição!',
            };
        } catch (error) {
            console.error('[FollowUpService] Error getting settings:', error.message);
            return {
                delayHours: this.defaultDelayHours,
                defaultMessage: 'Olá! Tudo bem? Passando para saber se tem alguma dúvida. Estou à disposição!',
            };
        }
    }

    /**
     * Find leads that need follow-up
     * Criteria:
     * - AI status is 'active'
     * - Last interaction is older than delay hours
     * - Follow-up count < max
     * - Last message was from AI (no response from user)
     */
    async getLeadsNeedingFollowup() {
        const settings = await this.getSettings();
        const cutoffTime = new Date();
        cutoffTime.setHours(cutoffTime.getHours() - settings.delayHours);

        try {
            const leads = await Lead.findAll({
                where: {
                    status: 'active',
                    ai_status: 'active',
                    last_interaction_at: { [Op.lt]: cutoffTime },
                    followup_count: { [Op.lt]: this.maxFollowups },
                },
                order: [['last_interaction_at', 'ASC']],
            });

            // Filter to only leads where last message was from AI (user hasn't responded)
            const leadsNeedingFollowup = [];
            for (const lead of leads) {
                const lastMessage = await Message.findOne({
                    where: { lead_id: lead.id },
                    order: [['timestamp', 'DESC']],
                });

                // Only follow up if last message was from AI
                if (lastMessage && lastMessage.sender === 'ai') {
                    leadsNeedingFollowup.push(lead);
                }
            }

            return leadsNeedingFollowup;
        } catch (error) {
            console.error('[FollowUpService] Error finding leads:', error.message);
            return [];
        }
    }

    /**
     * Get leads needing follow-up but AI is paused (need operator approval)
     */
    async getLeadsNeedingApproval() {
        const settings = await this.getSettings();
        const cutoffTime = new Date();
        cutoffTime.setHours(cutoffTime.getHours() - settings.delayHours);

        try {
            const leads = await Lead.findAll({
                where: {
                    status: 'active',
                    ai_status: { [Op.ne]: 'active' }, // AI is NOT active
                    last_interaction_at: { [Op.lt]: cutoffTime },
                    followup_count: { [Op.lt]: this.maxFollowups },
                },
                order: [['last_interaction_at', 'ASC']],
            });

            // Filter to only leads where last message was from AI
            const leadsNeedingApproval = [];
            for (const lead of leads) {
                const lastMessage = await Message.findOne({
                    where: { lead_id: lead.id },
                    order: [['timestamp', 'DESC']],
                });

                if (lastMessage && lastMessage.sender === 'ai') {
                    leadsNeedingApproval.push(lead);
                }
            }

            return leadsNeedingApproval;
        } catch (error) {
            console.error('[FollowUpService] Error finding leads for approval:', error.message);
            return [];
        }
    }

    /**
     * Send follow-up message to a lead
     */
    async sendFollowup(lead) {
        const settings = await this.getSettings();

        // Use custom message if set, otherwise use global default
        const message = lead.custom_followup_message || settings.defaultMessage;

        // Personalize message with lead name
        const personalizedMessage = message.replace(/{nome}/gi, lead.name);

        try {
            // Send via WhatsApp
            await whatsAppService.sendMessage(lead.phone, personalizedMessage, 2);

            // Save message to history
            await Message.create({
                lead_id: lead.id,
                content: personalizedMessage,
                sender: 'ai',
                timestamp: new Date(),
            });

            // Update lead follow-up tracking
            lead.last_followup_at = new Date();
            lead.followup_count = (lead.followup_count || 0) + 1;
            lead.last_interaction_at = new Date();
            await lead.save();

            console.log(`[FollowUpService] Follow-up #${lead.followup_count} sent to ${lead.name} (${lead.phone})`);
            return true;
        } catch (error) {
            console.error(`[FollowUpService] Error sending follow-up to ${lead.phone}:`, error.message);
            return false;
        }
    }

    /**
     * Run the follow-up job (called by CronJob)
     */
    async runFollowupJob() {
        console.log('[FollowUpService] Starting follow-up job...');

        const leads = await this.getLeadsNeedingFollowup();
        console.log(`[FollowUpService] Found ${leads.length} leads needing follow-up`);

        let sentCount = 0;
        for (const lead of leads) {
            const success = await this.sendFollowup(lead);
            if (success) sentCount++;

            // Small delay between messages to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        console.log(`[FollowUpService] Follow-up job complete. Sent ${sentCount}/${leads.length} messages.`);
        return { total: leads.length, sent: sentCount };
    }
}

module.exports = new FollowUpService();
