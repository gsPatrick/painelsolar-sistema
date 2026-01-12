const { Lead, Message, FollowUpRule } = require('../models');
const { Op } = require('sequelize');
const whatsAppService = require('./WhatsAppService');

class FollowUpService {
    constructor() {
    }

    /**
     * Find leads that need follow-up
     * Criteria:
     * - AI status is 'active'
     * - Last interaction is older than delay hours defined in Rule
     * - Last message was from AI (no response from user)
     */
    async getLeadsNeedingFollowup() {
        // Fetch all active rules
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

                // If no rules for this pipeline, SKIP completely. No default fallback.
                if (!pipelineRules || pipelineRules.length === 0) continue;

                // Determine next step
                const nextStep = (lead.followup_count || 0) + 1;
                const ruleToApply = pipelineRules.find(r => r.step_number === nextStep);

                // If no rule for the next step, SKIP. (End of sequence)
                if (!ruleToApply) continue;

                // Check delay
                const delayMs = ruleToApply.delay_hours * 60 * 60 * 1000;
                const timeSinceLastInteraction = new Date() - new Date(lead.last_interaction_at);

                if (timeSinceLastInteraction >= delayMs) {
                    // Lead needs follow-up!
                    lead.nextRule = ruleToApply; // Attach rule for processing
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

    async getLeadsNeedingApproval() {
        return [];
    }

    /**
     * Send follow-up message to a lead
     */
    async sendFollowup(lead) {
        // Strict Mode: Only send if rule is attached
        if (!lead.nextRule) {
            console.log(`[FollowUpService] Lead ${lead.id} has no rule attached. Skipping.`);
            return false;
        }

        let messageTemplate = lead.nextRule.message_template;

        if (!messageTemplate) {
            console.error(`[FollowUpService] Rule ${lead.nextRule.id} has no message template.`);
            return false;
        }

        // Personalize message with lead name
        const firstName = lead.name ? lead.name.split(' ')[0] : 'Cliente';
        const personalizedMessage = messageTemplate.replace(/{nome}/gi, firstName);

        try {
            // Send via WhatsApp
            await whatsAppService.sendText(lead.phone, personalizedMessage);

            // Save message to history
            await Message.create({
                lead_id: lead.id,
                content: personalizedMessage,
                sender: 'ai',
                timestamp: new Date(),
            });

            // Update lead follow-up tracking
            await lead.update({
                last_interaction_at: new Date(), // Reset timer
                followup_count: (lead.followup_count || 0) + 1,
                last_followup_rule_id: lead.nextRule.id
            });

            console.log(`[FollowUpService] Follow-up sent to ${lead.name} using Rule Step ${lead.nextRule.step_number}`);
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
