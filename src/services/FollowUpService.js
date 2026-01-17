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
            // Find all potential leads (Active & AI Active OR Human Intervention for Manual Checks)
            const leads = await Lead.findAll({
                where: {
                    status: 'active',
                    [Op.or]: [
                        { ai_status: 'active' },
                        { ai_status: null },
                        { ai_status: 'human_intervention' } // Include paused leads for manual delay check
                    ]
                },
                include: [{ model: require('../models').Pipeline, as: 'pipeline' }],
                order: [['last_interaction_at', 'ASC']],
            });

            const leadsNeedingFollowup = [];

            for (const lead of leads) {
                // DEBUG: Log lead being evaluated
                console.log(`[FollowUp DEBUG] Evaluating lead ${lead.id} (${lead.name}), ai_status: ${lead.ai_status}, pipeline: ${lead.pipeline?.title || 'N/A'}`);

                // Check last message to determine context
                const lastMessage = await Message.findOne({
                    where: { lead_id: lead.id },
                    order: [['timestamp', 'DESC']],
                });

                // If user responded, do NOT send automated follow-up (human intervention needed)
                if (lastMessage && lastMessage.sender !== 'ai') {
                    console.log(`[FollowUp DEBUG] Skip ${lead.name}: Last message was from user (${lastMessage.sender})`);
                    continue;
                }

                // NOVA VERIFICAÇÃO: Anti-spam cooldown - Se a última mensagem da IA foi há menos de 5 minutos, pular
                if (lastMessage && lastMessage.sender === 'ai') {
                    const minutesSinceLast = (new Date() - new Date(lastMessage.timestamp)) / 60000;
                    if (minutesSinceLast < 5) {
                        console.log(`[FollowUp DEBUG] Skip ${lead.name}: Last AI message was ${minutesSinceLast.toFixed(1)} minutes ago (cooldown)`);
                        continue;
                    }
                }

                // Determine reference time for delay calculation
                // If lastMessage exists (from AI), use its timestamp.
                // If NO message exists (new lead), use lead.createdAt or updated_at.
                let referenceTime = lead.last_interaction_at ? new Date(lead.last_interaction_at) : new Date(lead.updatedAt);

                if (lastMessage) {
                    referenceTime = new Date(lastMessage.timestamp);
                } else if (!referenceTime || isNaN(referenceTime.getTime())) {
                    // Fallback if dates are invalid
                    referenceTime = new Date(lead.createdAt);
                }

                // Check for Pipeline Specific Rules
                const pipelineRules = rulesByPipeline[lead.pipeline_id];

                // If no rules for this pipeline, SKIP
                if (!pipelineRules || pipelineRules.length === 0) {
                    // console.log(`[FollowUp] Skip ${lead.name}: No rules for pipeline ${lead.pipeline_id}`);
                    continue;
                }

                // Determine next step
                const nextStep = (lead.followup_count || 0) + 1;
                const ruleToApply = pipelineRules.find(r => r.step_number === nextStep);

                // If no rule for the next step, SKIP. (End of sequence)
                if (!ruleToApply) {
                    // console.log(`[FollowUp] Skip ${lead.name}: No rule for step ${nextStep}`);
                    continue;
                }

                // Check delay
                const delayMs = ruleToApply.delay_hours * 60 * 60 * 1000;
                const timeSinceReference = new Date() - referenceTime;

                // Log evaluation for debugging
                console.log(`[FollowUp] Eval ${lead.name}: Step ${nextStep}, Delay ${ruleToApply.delay_hours}h, Passed ${(timeSinceReference / 3600000).toFixed(2)}h, Required ${ruleToApply.delay_hours}h`);

                // VERIFICAÇÃO DE DELAY: Só prosseguir se tempo passado >= delay requerido
                if (timeSinceReference >= delayMs) {
                    console.log(`[FollowUp] ✅ Lead ${lead.name} QUALIFICA para follow-up (tempo: ${(timeSinceReference / 3600000).toFixed(2)}h >= ${ruleToApply.delay_hours}h)`);
                    // Lead needs follow-up!

                    // Safety Check:
                    // STRICT RULE: For "Proposta Enviada" stage, we ONLY send if AI is paused (human_intervention)
                    // For OTHER stages, we send if AI is active
                    const isPropostaEnviada = lead.pipeline && lead.pipeline.title === 'Proposta Enviada';

                    // DEBUG: Log pipeline check
                    console.log(`[FollowUp DEBUG] Lead ${lead.name}: Pipeline="${lead.pipeline?.title}", isPropostaEnviada=${isPropostaEnviada}, ai_status=${lead.ai_status}`);

                    // LOGIC:
                    // - If in "Proposta Enviada": ONLY send if human_intervention (meaning proposal was sent manually)
                    // - If in other stages: ONLY send if AI is active (normal automation)
                    if (isPropostaEnviada) {
                        // For Proposta Enviada: REQUIRE human_intervention
                        if (lead.ai_status !== 'human_intervention') {
                            console.log(`[FollowUp] ❌ Skip ${lead.name}: In 'Proposta Enviada' but ai_status is '${lead.ai_status}' (requires 'human_intervention')`);
                            continue;
                        }
                        console.log(`[FollowUp] ✅ Lead ${lead.name} in 'Proposta Enviada' with human_intervention - WILL SEND`);
                    } else {
                        // For other stages: Skip if human_intervention (human is handling)
                        if (lead.ai_status === 'human_intervention') {
                            console.log(`[FollowUp] ❌ Skip ${lead.name}: ai_status is human_intervention and NOT in 'Proposta Enviada'`);
                            continue;
                        }
                    }

                    lead.nextRule = ruleToApply; // Attach rule for processing
                    console.log(`[FollowUp] 📌 Adding ${lead.name} to follow-up list with rule step ${ruleToApply.step_number}, template: "${ruleToApply.message_template.substring(0, 50)}..."`);
                    leadsNeedingFollowup.push(lead);
                } else {
                    console.log(`[FollowUp] ⏳ Lead ${lead.name} NOT ready yet (tempo: ${(timeSinceReference / 3600000).toFixed(2)}h < ${ruleToApply.delay_hours}h)`);
                }
            }

            // [NEW] Check for "Delayed" leads that didn't match specific steps (e.g. sequence mismatch or old leads)
            // but are overdue based on the pipeline's rules.
            for (const lead of leads) {
                // Skip if already added
                if (leadsNeedingFollowup.find(l => l.id === lead.id)) continue;

                // Check last message - if user responded, skip
                const lastMessage = await Message.findOne({
                    where: { lead_id: lead.id },
                    order: [['timestamp', 'DESC']],
                });
                if (lastMessage && lastMessage.sender !== 'ai') continue; // User responded

                let referenceTime = lead.last_interaction_at ? new Date(lead.last_interaction_at) : new Date(lead.updatedAt);
                if (lastMessage) referenceTime = new Date(lastMessage.timestamp);

                const hoursSince = (new Date() - referenceTime) / (1000 * 60 * 60);

                // Determine Threshold
                const pipelineRules = rulesByPipeline[lead.pipeline_id] || [];
                let thresholdHours = 24; // Default fallback
                let bestRule = null;

                if (pipelineRules.length > 0) {
                    // Use the shortest delay rule for this pipeline as the threshold
                    // (Meaning: If you haven't spoken in X time, you are late, regardless of step count)
                    const sortedRules = [...pipelineRules].sort((a, b) => a.delay_hours - b.delay_hours);
                    thresholdHours = sortedRules[0].delay_hours;
                    bestRule = sortedRules[0]; // Use the first rule as template
                }

                if (hoursSince >= thresholdHours) {
                    // Add as manual only
                    lead.nextRule = bestRule || {
                        step_number: 'Manual',
                        message_template: 'Olá {nome}, tudo bem?', // Default
                        id: 'manual_fallback'
                    };
                    lead.manualOnly = true; // Flag to prevent auto-send by Cron, but allows manual send

                    // console.log(`[FollowUp] Found Manual Candidate ${lead.name}: ${hoursSince.toFixed(1)}h silent`);
                    leadsNeedingFollowup.push(lead);
                }
            }

            return leadsNeedingFollowup;

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
        // Strict Mode: Only send if rule is attached
        if (!lead.nextRule) {
            console.log(`[FollowUpService] Lead ${lead.id} has no rule attached. Attempting to resolve rule...`);

            // Fetch rules for this pipeline
            const rules = await FollowUpRule.findAll({
                where: { pipeline_id: lead.pipeline_id, active: true },
                order: [['step_number', 'ASC']]
            });

            if (rules.length > 0) {
                const nextStep = (lead.followup_count || 0) + 1;
                let rule = rules.find(r => r.step_number === nextStep);

                // If no exact step match, simpler fallback: use the FIRST rule (for manual sends on delayed leads)
                if (!rule) {
                    rule = rules[0];
                }

                if (rule) {
                    lead.nextRule = rule;
                    console.log(`[FollowUpService] Resolved rule for Lead ${lead.id}: Step ${rule.step_number}`);
                }
            }

            // If still no rule, fallback to generic Manual message
            if (!lead.nextRule) {
                console.log(`[FollowUpService] No rule found for Lead ${lead.id}. Using Manual Fallback.`);
                lead.nextRule = {
                    step_number: 'Manual',
                    message_template: 'Olá {nome}, tudo bem?',
                    id: 'manual_fallback'
                };
            }
        }

        let messageTemplate = lead.nextRule.message_template;

        if (!messageTemplate) {
            console.error(`[FollowUpService] Rule ${lead.nextRule.id} has no message template.`);
            return false;
        }

        // Personalize message with lead name
        const firstName = lead.name ? lead.name.split(' ')[0] : 'Cliente';
        // FIX: Regex now handles {nome} and {{nome}} (double braces)
        const personalizedMessage = messageTemplate.replace(/{{?nome}}?/gi, firstName);

        // IDEMPOTENCY CHECK: Prevent double sending
        // If the last interaction was less than 30 seconds ago, assume it's a duplicate trigger and skip.
        if (lead.last_interaction_at) {
            const secondsSinceLast = (new Date() - new Date(lead.last_interaction_at)) / 1000;
            if (secondsSinceLast < 30) {
                console.warn(`[FollowUpService] Skipping duplicate send for ${lead.name} (Last interaction: ${secondsSinceLast.toFixed(1)}s ago)`);
                return false;
            }
        }

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
     * Manuall mark a lead as having received a follow-up (without sending message)
     */
    async markAsSent(lead) {
        // Resolve rule if missing (same logic as sendFollowup)
        if (!lead.nextRule) {
            const rules = await FollowUpRule.findAll({
                where: { pipeline_id: lead.pipeline_id, active: true },
                order: [['step_number', 'ASC']]
            });
            if (rules.length > 0) {
                const nextStep = (lead.followup_count || 0) + 1;
                let rule = rules.find(r => r.step_number === nextStep) || rules[0];
                if (rule) lead.nextRule = rule;
            }
            if (!lead.nextRule) {
                lead.nextRule = { id: 'manual_mark', step_number: 'Manual' };
            }
        }

        try {
            await lead.update({
                last_interaction_at: new Date(),
                followup_count: (lead.followup_count || 0) + 1,
                last_followup_rule_id: lead.nextRule.id
            });
            return true;
        } catch (error) {
            console.error('[FollowUpService] Error marking as sent:', error);
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
            // Skip manual only leads for AUTO job
            if (lead.manualOnly) continue;

            const success = await this.sendFollowup(lead);
            if (success) sentCount++;

            // Safer Delay: Random between 5s and 10s
            const delay = Math.floor(Math.random() * (10000 - 5000 + 1)) + 5000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        console.log(`[FollowUpService] Follow-up job complete. Sent ${sentCount}/${leads.length} messages.`);
        return { total: leads.length, sent: sentCount };
    }

    /**
     * Bulk send follow-ups to specific leads (Manual Trigger)
     */
    async bulkSend(leadIds) {
        console.log(`[FollowUpService] Starting bulk send for ${leadIds.length} leads...`);
        let sentCount = 0;
        let errors = 0;

        for (const leadId of leadIds) {
            try {
                const lead = await Lead.findByPk(leadId, {
                    include: [{ model: require('../models').Pipeline, as: 'pipeline' }]
                });

                if (!lead) continue;

                const success = await this.sendFollowup(lead);
                if (success) sentCount++;
                else errors++;

                // Safer Delay: Random between 5s and 10s to avoid WhatsApp ban
                const delay = Math.floor(Math.random() * (10000 - 5000 + 1)) + 5000;
                console.log(`[FollowUpService] Waiting ${delay}ms before next send...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } catch (err) {
                console.error(`[FollowUpService] Error in bulk send for lead ${leadId}:`, err);
                errors++;
            }
        }

        return { total: leadIds.length, sent: sentCount, errors };
    }
    async getHistory() {
        const { Message, Lead } = require('../models');
        try {
            // Fetch ALL AI messages for history
            const history = await Message.findAll({
                where: { sender: 'ai' },
                order: [['timestamp', 'DESC']],
                include: [{
                    model: Lead,
                    as: 'lead',
                    attributes: ['id', 'name', 'phone'],
                    include: ['pipeline'] // Include Pipeline
                }]
            });
            console.log(`[FollowUpService] getHistory() found ${history.length} AI messages`);
            return history;
        } catch (error) {
            console.error('[FollowUpService] Error getting history:', error);
            return [];
        }
    }
    async bulkSend(leadIds) {
        // ... (existing code)
    }

    async bulkMarkAsSent(leadIds) {
        let count = 0;
        for (const leadId of leadIds) {
            try {
                const lead = await Lead.findByPk(leadId);
                if (lead) {
                    await this.markAsSent(lead);
                    count++;
                }
            } catch (err) {
                console.error(`[FollowUp] Error marking lead ${leadId} as sent:`, err);
            }
        }
        return { count };
    }
}

module.exports = new FollowUpService();
