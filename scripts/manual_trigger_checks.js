const cronService = require('./src/services/CronService');
const followUpService = require('./src/services/FollowUpService');
const { sequelize } = require('./src/models');

async function runManualChecks() {
    try {
        console.log('--- Iniciando Verificação Manual ---');

        // 1. SLA Check (Leads atrasados)
        console.log('\n[1/3] Verificando Leads Atrasados (SLA)...');
        await cronService.runSLACheckNow();

        // 2. Appointment Reminders
        console.log('\n[2/3] Verificando Lembretes de Agendamento...');
        await cronService.runReminderCheckNow();

        // 3. Follow-up Messages
        console.log('\n[3/3] Verificando Mensagens de Follow-up...');
        await followUpService.runFollowupJob();

        console.log('\n--- Verificação Completa! ---');
    } catch (error) {
        console.error('Erro na execução manual:', error);
    } finally {
        await sequelize.close();
        process.exit(0);
    }
}

// Ensure DB is connected before running
sequelize.authenticate().then(() => {
    runManualChecks();
}).catch(err => {
    console.error('Database connection failed:', err);
});
