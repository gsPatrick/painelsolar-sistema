const cron = require('node-cron');
const { Lead, Pipeline, Appointment, SystemSettings } = require('../models');
const { Op } = require('sequelize');
const whatsAppService = require('./WhatsAppService');
const followUpService = require('./FollowUpService');
const retryService = require('./RetryService');
const leadSweepService = require('./LeadSweepService');

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

        // Follow-up Rules Job - Runs every minute
        this.scheduleFollowUps();

        // SLA Alert Job - Runs every hour
        this.scheduleSLAAlerts();

        // Appointment Reminder Job - Runs every 30 minutes
        this.scheduleAppointmentReminders();

        // Retry / Anti-Ghosting Job - Runs every minute
        this.scheduleRetryJob();

        // Lead Sweep Job - Checks for stuck leads every minute
        this.scheduleLeadSweep();

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
     * Follow-up Job
     * Checks for leads needing automated follow-up messages
     */
    scheduleFollowUps() {
        // Run every minute
        const job = cron.schedule('* * * * *', async () => {
            console.log('[CronService] Running Follow-up check...');
            try {
                await followUpService.runFollowupJob();
            } catch (error) {
                console.error('[CronService] Error in Follow-up job:', error);
            }
        });

        this.jobs.push(job);
        console.log('[CronService] Follow-up job scheduled (every minute)');
    }

    /**
     * Appointment Reminder Job
     * Sends reminders 1 day before and 2 hours before appointments
     */
    scheduleAppointmentReminders() {
        // Run every 30 minutes
        const job = cron.schedule('*/30 * * * *', async () => {
            console.log('[CronService] Running appointment reminder check...');
            await this.checkAppointmentReminders();
        });

        this.jobs.push(job);
        console.log('[CronService] Appointment Reminder job scheduled (every 30 min)');
    }

    /**
     * Retry Job (Anti-Ghosting)
     * Checks for leads silent for >30m in early stages
     */
    scheduleRetryJob() {
        // Run every minute
        const job = cron.schedule('* * * * *', async () => {
            // console.log('[CronService] Running Anti-Ghosting Retry check...');
            await retryService.checkRetries();
        });

        this.jobs.push(job);
        console.log('[CronService] Retry Job (Anti-Ghosting) scheduled (every minute)');
    }

    /**
     * Lead Sweep Job
     * Checks for stuck leads in "Primeiro Contato" and moves or reminds them
     */
    scheduleLeadSweep() {
        // Run every minute
        const job = cron.schedule('* * * * *', async () => {
            console.log('[CronService] Running Lead Sweep check...');
            try {
                await leadSweepService.runSweepJob();
            } catch (error) {
                console.error('[CronService] Error in Lead Sweep job:', error);
            }
        });

        this.jobs.push(job);
        console.log('[CronService] Lead Sweep job scheduled (every minute)');
    }

    /**
     * Check for appointments that need reminders
     */
    async checkAppointmentReminders() {
        try {
            // Load reminder settings from database
            const reminderEnabled = await SystemSettings.findOne({ where: { key: 'reminder_enabled' } });
            if (!reminderEnabled || reminderEnabled.value !== 'true') {
                console.log('[CronService] Reminders are disabled');
                return;
            }

            const reminder1dayEnabled = await SystemSettings.findOne({ where: { key: 'reminder_1day_enabled' } });
            const reminder2hoursEnabled = await SystemSettings.findOne({ where: { key: 'reminder_2hours_enabled' } });
            const reminder1dayMessage = await SystemSettings.findOne({ where: { key: 'reminder_1day_message' } });
            const reminder2hoursMessage = await SystemSettings.findOne({ where: { key: 'reminder_2hours_message' } });

            const now = new Date();

            // Check for appointments needing 1-day reminder (24-25 hours away)
            if (reminder1dayEnabled?.value === 'true') {
                const oneDayMin = new Date(now);
                oneDayMin.setHours(oneDayMin.getHours() + 23);
                const oneDayMax = new Date(now);
                oneDayMax.setHours(oneDayMax.getHours() + 25);

                const oneDayAppointments = await Appointment.findAll({
                    where: {
                        status: 'scheduled',
                        reminded_1day: false,
                        date_time: { [Op.between]: [oneDayMin, oneDayMax] }
                    },
                    include: [{ model: Lead, as: 'lead' }]
                });

                for (const apt of oneDayAppointments) {
                    if (apt.lead?.phone) {
                        const typeLabel = apt.type === 'VISITA_TECNICA' ? 'Visita Técnica' : 'Instalação';
                        const dateStr = new Date(apt.date_time).toLocaleDateString('pt-BR');
                        const timeStr = new Date(apt.date_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

                        // Use custom message or default
                        let message = reminder1dayMessage?.value || '📅 *Lembrete de Agendamento*\n\nOlá, {nome}! Sua *{tipo}* está agendada para *amanhã ({data})* às *{hora}*.';
                        message = message
                            .replace(/{nome}/g, apt.lead.name)
                            .replace(/{tipo}/g, typeLabel)
                            .replace(/{data}/g, dateStr)
                            .replace(/{hora}/g, timeStr);

                        await whatsAppService.sendText(apt.lead.phone, message);
                        await apt.update({ reminded_1day: true });
                        console.log(`[CronService] 1-day reminder sent for appointment ${apt.id}`);
                    }
                }
            }

            // Check for appointments needing 2-hour reminder (1.5 to 2.5 hours away)
            if (reminder2hoursEnabled?.value === 'true') {
                const twoHoursMin = new Date(now);
                twoHoursMin.setMinutes(twoHoursMin.getMinutes() + 90);
                const twoHoursMax = new Date(now);
                twoHoursMax.setMinutes(twoHoursMax.getMinutes() + 150);

                const twoHourAppointments = await Appointment.findAll({
                    where: {
                        status: 'scheduled',
                        reminded_2hours: false,
                        date_time: { [Op.between]: [twoHoursMin, twoHoursMax] }
                    },
                    include: [{ model: Lead, as: 'lead' }]
                });

                for (const apt of twoHourAppointments) {
                    if (apt.lead?.phone) {
                        const typeLabel = apt.type === 'VISITA_TECNICA' ? 'Visita Técnica' : 'Instalação';
                        const timeStr = new Date(apt.date_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

                        // Use custom message or default
                        let message = reminder2hoursMessage?.value || '⏰ *Lembrete: Faltam 2 horas!*\n\nOlá, {nome}! Sua *{tipo}* está marcada para *hoje às {hora}*.';
                        message = message
                            .replace(/{nome}/g, apt.lead.name)
                            .replace(/{tipo}/g, typeLabel)
                            .replace(/{hora}/g, timeStr);

                        await whatsAppService.sendText(apt.lead.phone, message);
                        await apt.update({ reminded_2hours: true });

                        // Also send admin alert
                        const adminMsg = `🔔 *Lembrete de Agendamento*\n\n📍 ${typeLabel} em 2 horas\n👤 ${apt.lead.name}\n📞 ${apt.lead.phone}\n⏰ ${timeStr}`;
                        await whatsAppService.sendAdminAlert(adminMsg);

                        console.log(`[CronService] 2-hour reminder sent for appointment ${apt.id}`);
                    }
                }
            }

            console.log('[CronService] Reminder check complete');

        } catch (error) {
            console.error('[CronService] Error checking appointment reminders:', error);
        }
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
     * Manually trigger reminder check (for testing)
     */
    async runReminderCheckNow() {
        console.log('[CronService] Manually triggering reminder check...');
        await this.checkAppointmentReminders();
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

