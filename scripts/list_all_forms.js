const metaService = require('../src/services/MetaService');
const pageId = '534745156397254';

async function listFormsAndLeads() {
    console.log(`--- Listando Formulários da Página ${pageId} ---`);
    try {
        const forms = await metaService.getPageForms(pageId);
        console.log(`Total de formulários encontrados: ${forms.length}\n`);

        for (const form of forms) {
            console.log(`Formulário: ${form.name} (ID: ${form.id})`);
            console.log(`  Status: ${form.status}`);
            console.log(`  Contagem de Leads (Total): ${form.leads_count}`);
            
            // Fetch most recent 5 leads to check date
            try {
                const leads = await metaService.getFormLeads(form.id, 5);
                if (leads.length > 0) {
                    console.log(`  Lead mais recente em: ${leads[0].created_time}`);
                } else {
                    console.log(`  Sem leads recentes.`);
                }
            } catch (e) {
                console.log(`  Erro ao buscar leads do formulário: ${e.message}`);
            }
            console.log('---');
        }

    } catch (error) {
        console.error('❌ Erro:', error.message);
    }
}

listFormsAndLeads();
