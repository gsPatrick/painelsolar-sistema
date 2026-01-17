/**
 * LeadSweepService
 * 
 * Periodically checks for leads stuck in "Primeiro Contato" and:
 * 1. If lead has all required data (monthly_bill + city) → Move to "Aguardando Proposta"
 * 2. If lead missing data and hasn't been contacted recently → Send reminder message
 */

const { Lead, Pipeline, Message } = require('../models');
const { Op } = require('sequelize');
const whatsAppService = require('./WhatsAppService');
const openAIService = require('./OpenAIService');

class LeadSweepService {
    constructor() {
        this.MINIMUM_IDLE_MINUTES = 30; // Only process leads idle for at least 30 min
    }

    /**
     * Run the sweep job (called by CronJob every minute)
     */
    async runSweepJob() {
        console.log('[LeadSweep] Starting sweep job...');

        try {
            // Find "Primeiro Contato" pipeline
            const primeiroContato = await Pipeline.findOne({ where: { title: 'Primeiro Contato' } });
            const aguardandoProposta = await Pipeline.findOne({ where: { title: 'Aguardando Proposta' } });

            if (!primeiroContato || !aguardandoProposta) {
                console.warn('[LeadSweep] Required pipelines not found. Skipping.');
                return { processed: 0, moved: 0, reminded: 0 };
            }

            // Find leads stuck in "Primeiro Contato" that are idle for at least 30 min
            const idleThreshold = new Date(Date.now() - this.MINIMUM_IDLE_MINUTES * 60 * 1000);

            const stuckLeads = await Lead.findAll({
                where: {
                    pipeline_id: primeiroContato.id,
                    status: 'active',
                    ai_status: 'active', // Only AI-managed leads
                    last_interaction_at: { [Op.lt]: idleThreshold }
                },
                order: [['last_interaction_at', 'ASC']],
                limit: 10 // Process max 10 per run to avoid overload
            });

            console.log(`[LeadSweep] Found ${stuckLeads.length} stuck leads in "Primeiro Contato"`);

            let movedCount = 0;
            let remindedCount = 0;

            for (const lead of stuckLeads) {
                // Check last message - only process if last message was from AI (user hasn't responded)
                const lastMessage = await Message.findOne({
                    where: { lead_id: lead.id },
                    order: [['timestamp', 'DESC']],
                });

                if (lastMessage && lastMessage.sender === 'user') {
                    // User responded, AI should handle naturally - skip
                    console.log(`[LeadSweep] Skip ${lead.name}: Last message was from user`);
                    continue;
                }

                // Check if lead has minimum required data
                const hasMinimumData = lead.monthly_bill && lead.city;

                if (hasMinimumData) {
                    // Lead has data but is stuck - MOVE to Aguardando Proposta
                    console.log(`[LeadSweep] 🎯 Lead ${lead.name} has complete data. Moving to Aguardando Proposta...`);

                    lead.pipeline_id = aguardandoProposta.id;
                    lead.ai_status = 'human_intervention';
                    lead.ai_paused_at = new Date();
                    lead.qualification_complete = true;
                    await lead.save();

                    movedCount++;
                    console.log(`[LeadSweep] ✅ Moved ${lead.name} to "Aguardando Proposta"`);

                } else {
                    // Lead missing data - send reminder asking for what's missing
                    const missingFields = [];
                    if (!lead.monthly_bill) missingFields.push('valor da conta de luz');
                    if (!lead.city) missingFields.push('cidade');
                    if (!lead.segment) missingFields.push('segmento (residencial/comercial)');
                    if (!lead.roof_type) missingFields.push('tipo de telhado');

                    console.log(`[LeadSweep] ⚠️ Lead ${lead.name} missing: ${missingFields.join(', ')}`);

                    // Generate natural reminder message
                    const reminderMessage = this.generateReminderMessage(lead.name, missingFields);

                    try {
                        await whatsAppService.sendMessage(lead.phone, reminderMessage, 2);

                        // Save to history
                        await Message.create({
                            lead_id: lead.id,
                            content: reminderMessage,
                            sender: 'ai',
                            timestamp: new Date(),
                        });

                        // Update last interaction to prevent immediate re-send
                        lead.last_interaction_at = new Date();
                        await lead.save();

                        remindedCount++;
                        console.log(`[LeadSweep] 📤 Reminder sent to ${lead.name}`);

                    } catch (err) {
                        console.error(`[LeadSweep] Error sending reminder to ${lead.name}:`, err.message);
                    }
                }

                // Small delay between leads to avoid WhatsApp rate limiting
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            console.log(`[LeadSweep] Job complete. Moved: ${movedCount}, Reminded: ${remindedCount}`);
            return { processed: stuckLeads.length, moved: movedCount, reminded: remindedCount };

        } catch (error) {
            console.error('[LeadSweep] Error in sweep job:', error.message);
            return { processed: 0, moved: 0, reminded: 0 };
        }
    }

    /**
     * Generate a natural reminder message based on missing fields
     * Messages are contextual - implies analysis is in progress
     */
    generateReminderMessage(leadName, missingFields) {
        const firstName = leadName ? leadName.split(' ')[0] : 'Oi';

        if (missingFields.length === 1) {
            const field = missingFields[0];
            return `Oi ${firstName}! 😊 Nosso engenheiro está analisando e, pra finalizar sua proposta, só preciso confirmar: qual o ${field}?`;
        } else if (missingFields.length === 2) {
            return `Oi ${firstName}! Nosso time está finalizando a análise. Pra gerar sua proposta personalizada, preciso só de duas informações: ${missingFields[0]} e ${missingFields[1]}. Consegue me passar?`;
        } else {
            // 3+ missing - ask for most important first (monthly_bill)
            return `Oi ${firstName}! Estamos preparando sua proposta de energia solar. Pra calcular a economia exata, me confirma: qual o valor médio da sua conta de luz e qual sua cidade?`;
        }
    }
}

module.exports = new LeadSweepService();
