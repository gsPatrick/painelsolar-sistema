const SyncLog = require('../src/models/synclog');

async function syncTable() {
    console.log('--- Sincronizando Tabela SyncLog ---');
    try {
        await SyncLog.sync({ alter: true });
        console.log('✅ Tabela sync_logs criada/verificada com sucesso.');
    } catch (error) {
        console.error('❌ Erro ao sincronizar tabela:', error.message);
    }
}

syncTable();
