const { Lead, Message, FollowUpRule } = require('../models');
const { Op } = require('sequelize');
const whatsAppService = require('./WhatsAppService');
const openAIService = require('./OpenAIService');

class FollowUpService {
    constructor() {
        this.isRunning = false;
        this.processingLeads = new Set();
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
        const { SystemSettings } = require('../models');
        let rulesWhere = { active: true };

        try {
            // CHECK FOR FUNNEL FILTER (selected_funnels)
            const funnelSetting = await SystemSettings.findOne({ where: { key: 'followup_selected_funnels' } });
            if (funnelSetting && funnelSetting.value) {
                const selectedFunnels = JSON.parse(funnelSetting.value); // Expects array of IDs
                if (Array.isArray(selectedFunnels) && selectedFunnels.length > 0) {
                    // console.log(`[FollowUpService] Filtering by selected funnels: ${selectedFunnels}`);
                    rulesWhere.pipeline_id = { [Op.in]: selectedFunnels };
                } else {
                    console.log('[FollowUpService] Selected funnels filter is empty. Running for ALL.');
                }
            }
        } catch (err) {
            console.error('[FollowUpService] Error parsing funnel filter:', err);
        }

        const rules = await FollowUpRule.findAll({
            where: rulesWhere,
            order: [['step_number', 'ASC']]
        });

        // Group rules by pipeline_id
        const rulesByPipeline = {};
        rules.forEach(rule => {
            if (!rulesByPipeline[rule.pipeline_id]) rulesByPipeline[rule.pipeline_id] = [];
            rulesByPipeline[rule.pipeline_id].push(rule);
        });

        const leadsNeedingFollowup = [];

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

            for (const lead of leads) {
                // DEBUG: Log lead being evaluated
                // console.log(`[FollowUp DEBUG] Evaluating lead ${lead.id} (${lead.name}), ai_status: ${lead.ai_status}, pipeline: ${lead.pipeline?.title || 'N/A'}`);

                // Check last message to determine context
                const lastMessage = await Message.findOne({
                    where: { lead_id: lead.id },
                    order: [['timestamp', 'DESC']],
                });

                // If user responded, do NOT send automated follow-up (human intervention needed)
                if (lastMessage && lastMessage.sender !== 'ai') {
                    // console.log(`[FollowUp DEBUG] Skip ${lead.name}: Last message was from user/agent (${lastMessage.sender})`);
                    continue;
                }

                // 🛑 ANTI-SPAM GUARD: If we have 2 or more consecutive AI messages WITHOUT user response, 
                // we stop auto-followup to prevent spamming a silent lead forever.
                const lastTwoMessages = await Message.findAll({
                    where: { lead_id: lead.id },
                    order: [['timestamp', 'DESC']],
                    limit: 2
                });

                if (lastTwoMessages.length >= 2 &&
                    lastTwoMessages[0].sender === 'ai' &&
                    lastTwoMessages[1].sender === 'ai') {
                    // console.log(`[FollowUp DEBUG] 🛑 Skip ${lead.name}: 2 consecutive AI messages already sent. Waiting for user.`);
                    continue;
                }

                // NOVA VERIFICAÇÃO: Anti-spam cooldown - Se a última mensagem da IA foi há menos de 5 minutos, pular
                if (lastMessage && lastMessage.sender === 'ai') {
                    const minutesSinceLast = (new Date() - new Date(lastMessage.timestamp)) / 60000;
                    if (minutesSinceLast < 5) {
                        // console.log(`[FollowUp DEBUG] Skip ${lead.name}: Last AI message was ${minutesSinceLast.toFixed(1)} minutes ago (cooldown)`);
                        continue;
                    }
                }

                // Determine reference time for delay calculation
                let referenceTime = lead.last_interaction_at ? new Date(lead.last_interaction_at) : new Date(lead.updatedAt);

                if (lastMessage) {
                    referenceTime = new Date(lastMessage.timestamp);
                } else if (!referenceTime || isNaN(referenceTime.getTime())) {
                    referenceTime = new Date(lead.createdAt);
                }

                // Check for Pipeline Specific Rules
                const pipelineRules = rulesByPipeline[lead.pipeline_id];

                // If no rules for this pipeline, SKIP
                if (!pipelineRules || pipelineRules.length === 0) {
                    continue;
                }

                // Determine next step
                const nextStep = (lead.followup_count || 0) + 1;
                const ruleToApply = pipelineRules.find(r => r.step_number === nextStep);

                // If no rule for the next step, SKIP. (End of sequence)
                if (!ruleToApply) {
                    continue;
                }

                // Check delay
                const delayMs = ruleToApply.delay_hours * 60 * 60 * 1000;
                const timeSinceReference = new Date() - referenceTime;

                // VERIFICAÇÃO DE DELAY: Só prosseguir se tempo passado >= delay requerido
                if (timeSinceReference >= delayMs) {
                    console.log(`[FollowUp] ✅ Lead ${lead.name} QUALIFICA para follow-up (tempo: ${(timeSinceReference / 3600000).toFixed(2)}h >= ${ruleToApply.delay_hours}h)`);

                    // Safety Check:
                    // STRICT RULE: For "Proposta Enviada" stage, we ONLY send if AI is paused (human_intervention)
                    // For OTHER stages, we send if AI is active
                    const isPropostaEnviada = lead.pipeline && lead.pipeline.title === 'Proposta Enviada';

                    // LOGIC:
                    // - If in "Proposta Enviada": ONLY send if human_intervention (meaning proposal was sent manually)
                    // - If in other stages: ONLY send if AI is active (normal automation)
                    if (isPropostaEnviada) {
                        // For Proposta Enviada: REQUIRE human_intervention
                        if (lead.ai_status !== 'human_intervention') {
                            continue;
                        }
                    } else {
                        // For other stages: Skip if human_intervention (human is handling)
                        if (lead.ai_status === 'human_intervention') {
                            continue;
                        }
                    }

                    lead.nextRule = ruleToApply; // Attach rule for processing
                    leadsNeedingFollowup.push(lead);
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

                // [FIX] Anti-spam cooldown check for "Delayed" leads
                if (lastMessage && lastMessage.sender === 'ai') {
                    const minutesSinceLast = (new Date() - new Date(lastMessage.timestamp)) / 60000;
                    if (minutesSinceLast < 5) continue; // Skip if sent less than 5 mins ago
                }

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
        // 🔒 GLOBAL LOCK: Check if lead is already being processed in this instance
        if (this.processingLeads.has(lead.id)) {
            console.warn(`[FollowUpService] 🔒 Skip ${lead.id}: Already being processed in this run.`);
            return false;
        }

        this.processingLeads.add(lead.id);

        try {
            // 🛑 FINAL SAFETY CHECK: Check DB one last time for recent messages
            const lastMessage = await Message.findOne({
                where: { lead_id: lead.id, sender: 'ai' },
                order: [['timestamp', 'DESC']],
            });

            if (lastMessage) {
                const minutesSinceLast = (new Date() - new Date(lastMessage.timestamp)) / 60000;
                // STRICT 2-MINUTE COOLDOWN (Redundant but necessary for safety)
                if (minutesSinceLast < 2) {
                    console.warn(`[FollowUpService] 🛑 CRITICAL SKIP ${lead.name}: Message sent ${minutesSinceLast.toFixed(1)}m ago. PREVENTING SPAM.`);
                    return false;
                }
            }

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

            let finalMessage = personalizedMessage;

            // TRY AI GENERATION FOR BETTER CONTEXT
            try {
                const recentHistory = await Message.findAll({
                    where: { lead_id: lead.id },
                    order: [['timestamp', 'DESC']],
                    limit: 15
                });
                const conversationHistory = recentHistory.reverse();

                const aiFollowup = await openAIService.generateFollowup(conversationHistory, {
                    name: lead.name,
                    phone: lead.phone,
                    pipeline_title: lead.pipeline ? lead.pipeline.title : 'Não identificado',
                    monthly_bill: lead.monthly_bill,
                    segment: lead.segment,
                    city: lead.city
                }, personalizedMessage);

                if (aiFollowup.success) {
                    if (aiFollowup.skip) {
                        console.log(`[FollowUpService] ⏭️ AI suggested SKIPPING follow-up for ${lead.name} based on context.`);
                        return false;
                    }
                    if (aiFollowup.message) {
                        console.log(`[FollowUpService] 🤖 AI generated custom follow-up for ${lead.name}`);
                        finalMessage = aiFollowup.message;
                    }
                }
            } catch (aiError) {
                console.warn(`[FollowUpService] AI follow-up generation failed for ${lead.name}, falling back to template:`, aiError.message);
            }

            // IDEMPOTENCY CHECK: Prevent double sending
            if (lead.last_interaction_at) {
                const secondsSinceLast = (new Date() - new Date(lead.last_interaction_at)) / 1000;
                if (secondsSinceLast < 30) {
                    console.warn(`[FollowUpService] Skipping duplicate send for ${lead.name} (Last interaction: ${secondsSinceLast.toFixed(1)}s ago)`);
                    return false;
                }
            }

            try {
                // Send via WhatsApp
                await whatsAppService.sendText(lead.phone, finalMessage);

                // Save message to history
                await Message.create({
                    lead_id: lead.id,
                    content: finalMessage,
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
        } finally {
            // RELEASE LOCK
            this.processingLeads.delete(lead.id);
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
        if (this.isRunning) {
            console.log('[FollowUpService] ⚠️ Job already running. Skipping this cycle.');
            return { skipped: true };
        }

        this.isRunning = true;
        console.log('[FollowUpService] Starting follow-up job...');

        try {
            const leads = await this.getLeadsNeedingFollowup();
            console.log(`[FollowUpService] Found ${leads.length} leads needing follow-up`);

            let sentCount = 0;
            // Iterate with index to prevent infinite loops if array mutates
            for (let i = 0; i < leads.length; i++) {
                const lead = leads[i];

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
        } catch (err) {
            console.error('[FollowUpService] Error in runFollowupJob:', err);
            return { error: err.message };
        } finally {
            this.isRunning = false;
        }
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
