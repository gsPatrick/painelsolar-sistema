const cron = require('node-cron');
const { Lead, Pipeline } = require('../models');
const { Op } = require('sequelize');
const whatsAppService = require('./WhatsAppService');

/**
 * CronService - Automated tasks for Solar CRM
 */
class CronService {
    constructor() {
        this.jobs = [];
    }

    /**
     * Initialize all cron jobs
     */
    init() {
        console.log('[CronService] Initializing scheduled jobs...');

        // SLA Alert Job - Runs every hour
        this.scheduleSLAAlerts();

        console.log('[CronService] All jobs scheduled.');
    }

    /**
     * SLA Alert Job
     * Checks for leads stuck for 3+ days and alerts admin
     */
    scheduleSLAAlerts() {
        // Run every hour at minute 0
        const job = cron.schedule('0 * * * *', async () => {
            console.log('[CronService] Running SLA check...');
            await this.checkSLAAlerts();
        });

        this.jobs.push(job);
        console.log('[CronService] SLA Alert job scheduled (hourly)');
    }

    /**
     * Check for leads that have been inactive for 3+ days
     */
    async checkSLAAlerts() {
        try {
            const threeDaysAgo = new Date();
            threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

            // Find leads that are NOT in "Fechamento" or "Pós Venda" (closed pipelines)
            const closedPipelines = await Pipeline.findAll({
                where: {
                    title: {
                        [Op.in]: ['Fechamento', 'Pós Venda', 'Ganhos', 'Perdidos']
                    }
                }
            });

            const closedPipelineIds = closedPipelines.map(p => p.id);

            // Find stuck leads
            const stuckLeads = await Lead.findAll({
                where: {
                    last_interaction_at: {
                        [Op.lt]: threeDaysAgo
                    },
                    pipeline_id: {
                        [Op.notIn]: closedPipelineIds
                    }
                },
                include: [{
                    model: Pipeline,
                    as: 'pipeline'
                }]
            });

            if (stuckLeads.length === 0) {
                console.log('[CronService] No stuck leads found.');
                return;
            }

            console.log(`[CronService] Found ${stuckLeads.length} stuck leads.`);

            // Send alert for each stuck lead
            for (const lead of stuckLeads) {
                const daysDiff = Math.floor(
                    (new Date() - new Date(lead.last_interaction_at)) / (1000 * 60 * 60 * 24)
                );

                const pipelineName = lead.pipeline?.title || 'Pipeline desconhecido';

                const alertMessage = `⚠️ *Alerta: Lead Parado*

O lead *${lead.name}* está parado na etapa "*${pipelineName}*" há *${daysDiff} dias*.

📞 Telefone: ${lead.phone}
📅 Última interação: ${new Date(lead.last_interaction_at).toLocaleDateString('pt-BR')}

Por favor, verifique e tome uma ação!`;

                await whatsAppService.sendAdminAlert(alertMessage);
                console.log(`[CronService] Alert sent for lead ${lead.id}`);
            }

        } catch (error) {
            console.error('[CronService] Error checking SLA alerts:', error);
        }
    }

    /**
     * Manually trigger SLA check (for testing)
     */
    async runSLACheckNow() {
        console.log('[CronService] Manually triggering SLA check...');
        await this.checkSLAAlerts();
    }

    /**
     * Stop all scheduled jobs
     */
    stopAll() {
        this.jobs.forEach(job => job.stop());
        console.log('[CronService] All jobs stopped.');
    }
}

module.exports = new CronService();
