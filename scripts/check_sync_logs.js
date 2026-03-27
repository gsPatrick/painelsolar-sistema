const { SyncLog } = require('../src/models');

async function checkSyncLogs() {
    console.log('--- Logs de Sincronização Recentes ---');
    try {
        const logs = await SyncLog.findAll({
            order: [['startedAt', 'DESC']],
            limit: 10
        });

        if (logs.length === 0) {
            console.log('Nenhum log de sincronização encontrado.');
            return;
        }

        logs.forEach(log => {
            console.log(`[${log.startedAt}] Status: ${log.status}, Leads: ${log.leads_added}/${log.leads_found}`);
            if (log.message) console.log(`  Mensagem: ${log.message}`);
            if (log.error_details) console.log(`  Erro: ${JSON.stringify(log.error_details)}`);
            console.log('---');
        });

    } catch (error) {
        console.error('❌ Erro ao consultar SyncLog:', error.message);
    }
}

checkSyncLogs();
