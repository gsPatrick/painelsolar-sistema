const metaSyncService = require('../src/services/MetaSyncService');

async function debugSync() {
    console.log('--- Debug Manual MetaSyncService ---');
    try {
        await metaSyncService.runSyncJob();
        console.log('--- Fim do Debug ---');
    } catch (error) {
        console.error('❌ Erro fatal no debug:', error);
    }
}

debugSync();
