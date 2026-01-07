const { Lead, Message, SystemSettings, FollowUpRule } = require('../models');
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
        const rules = await FollowUpRule.findAll({
            where: { active: true },
            order: [['step_number', 'ASC']]
        });

        // Group rules by pipeline_id
        const rulesByPipeline = {};
        rules.forEach(rule => {
            if (!rulesByPipeline[rule.pipeline_id]) rulesByPipeline[rule.pipeline_id] = [];
            rulesByPipeline[rule.pipeline_id].push(rule);
        });

        try {
            // Find all potential leads (Active & AI Active)
            // We can't filter by time in SQL easily because delay depends on pipeline rule
            const leads = await Lead.findAll({
                where: {
                    status: 'active',
                    ai_status: 'active',
                },
                order: [['last_interaction_at', 'ASC']],
            });

            const leadsNeedingFollowup = [];

            for (const lead of leads) {
                // Must ensure last message was from AI (user silence)
                const lastMessage = await Message.findOne({
                    where: { lead_id: lead.id },
                    order: [['timestamp', 'DESC']],
                });

                if (!lastMessage || lastMessage.sender !== 'ai') continue;

                // Check for Pipeline Specific Rules
                const pipelineRules = rulesByPipeline[lead.pipeline_id];
                let ruleToApply = null;
                let delayHours = settings.delayHours; // Default Global

                if (pipelineRules && pipelineRules.length > 0) {
                    // Find rule for next step (current count + 1)
                    // e.g. Count 0 -> Step 1. Count 1 -> Step 2.
                    const nextStep = (lead.followup_count || 0) + 1;
                    ruleToApply = pipelineRules.find(r => r.step_number === nextStep);

                    if (ruleToApply) {
                        delayHours = ruleToApply.delay_hours;
                    } else {
                        // No rule for this step (e.g. exceeded max rules) -> Stop or Use Default?
                        // If we have rules for this pipeline, usually we follow them strictly.
                        // If step > max rules, we do nothing (end of sequence).
                        continue;
                    }
                } else {
                    // No rules for this pipeline -> Use Global Logic
                    if ((lead.followup_count || 0) >= this.maxFollowups) continue;
                }

                // Check time since last interaction
                const hoursSinceLastInteraction = (new Date() - new Date(lead.last_interaction_at)) / (1000 * 60 * 60);

                if (hoursSinceLastInteraction >= delayHours) {
                    // Attach rule to lead for sender usage
                    if (ruleToApply) lead.nextRule = ruleToApply;
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
        // ... (Same logic for paused leads, but maybe should show rules too? 
        // For now keep as is: showing all paused leads that *would* need follow up OR just all paused)
        // User requested "Show Immediately", so we removed time filter previously.
        // Let's keep previous implementation but ensure imports work.

        try {
            const leads = await Lead.findAll({
                where: {
                    status: 'active',
                    ai_status: { [Op.ne]: 'active' }, // AI is NOT active
                    // Filter removed as per user request
                    followup_count: { [Op.lt]: this.maxFollowups },
                },
                order: [['last_interaction_at', 'ASC']],
            });

            // Filter AI sender logic...
            const validLeads = [];
            for (const lead of leads) {
                const lastMessage = await Message.findOne({
                    where: { lead_id: lead.id },
                    order: [['timestamp', 'DESC']],
                });
                if (lastMessage && lastMessage.sender === 'ai') {
                    validLeads.push(lead);
                }
            }
            return validLeads;
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

        // Use Rule message if available, else Custom, else Global Default
        let messageTemplate = settings.defaultMessage;

        if (lead.nextRule && lead.nextRule.message_template) {
            messageTemplate = lead.nextRule.message_template;
        } else if (lead.custom_followup_message) {
            messageTemplate = lead.custom_followup_message;
        }

        // Personalize message with lead name
        const personalizedMessage = messageTemplate.replace(/{nome}/gi, lead.name.split(' ')[0]); // First name only usually better

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

            console.log(`[FollowUpService] Follow-up sent to ${lead.name} using Rule: ${lead.nextRule ? 'Step ' + lead.nextRule.step_number : 'Global'}`);
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
