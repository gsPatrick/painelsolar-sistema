const metaService = require('../src/services/MetaService');
const pageId = '534745156397254';
const formWithLeadsId = '800341236251423';

async function testSync() {
    console.log('--- Teste de Sincronização Meta ---');
    try {
        console.log(`Buscando leads do formulário ${formWithLeadsId}...`);
        const leads = await metaService.getFormLeads(formWithLeadsId, 10);
        console.log(`Encontrados ${leads.length} leads.`);
        leads.forEach(l => {
            const fields = metaService.parseFieldData(l.field_data);
            console.log(`  Lead: ${fields.name || 'Sem nome'}, Tel: ${fields.phone || 'Sem tel'}, Criado: ${l.created_time}`);
        });

    } catch (error) {
        console.error('❌ Erro no teste:', error.response?.data || error.message);
    }
}

testSync();
