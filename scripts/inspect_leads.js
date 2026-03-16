const path = require('path');
const envPath = path.resolve(__dirname, '../.env');
console.log('Loading .env from:', envPath);
const result = require('dotenv').config({ path: envPath, debug: true });

if (result.error) {
    console.error('Error loading .env:', result.error);
}

const axios = require('axios');

const ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN || process.env.FB_PAGE_ACCESS_TOKEN;
const API_VERSION = 'v22.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

if (!ACCESS_TOKEN) {
    console.error('❌ ERRO: META_PAGE_ACCESS_TOKEN (ou FB_PAGE_ACCESS_TOKEN) não encontrado no .env');
    console.log('Vars encontradas:', Object.keys(process.env).filter(k => k.includes('TOKEN')));
    process.exit(1);
}

async function inspectLeads() {
    try {
        console.log('🔍 Iniciando inspeção de Leads do Meta...\n');

        // 1. Identificar a Página / Usuário
        console.log('--- 1. IDENTIFICAÇÃO ---');
        const meResponse = await axios.get(`${BASE_URL}/me`, {
            params: { access_token: ACCESS_TOKEN, fields: 'id,name,accounts' }
        });
        console.log(`Token pertence a: ${meResponse.data.name} (ID: ${meResponse.data.id})`);

        let pageId = meResponse.data.id;
        let pageToken = ACCESS_TOKEN;

        // Se for um usuário, tentar pegar a primeira página
        if (meResponse.data.accounts) {
            console.log('Token de usuário detectado. Listando páginas...');
            const pages = meResponse.data.accounts.data;
            if (pages.length > 0) {
                pageId = pages[0].id;
                pageToken = pages[0].access_token;
                console.log(`Usando primeira página encontrada: ${pages[0].name} (ID: ${pageId})`);
            } else {
                console.log('Nenhuma página encontrada para este usuário.');
            }
        }
        console.log('------------------------\n');

        // 2. Listar Formulários
        console.log('--- 2. FORMULÁRIOS DISPONÍVEIS ---');
        const formsResponse = await axios.get(`${BASE_URL}/${pageId}/leadgen_forms`, {
            params: { access_token: pageToken, fields: 'id,name,status,leads_count' }
        });

        const forms = formsResponse.data.data || [];
        console.log(`Encontrados ${forms.length} formulários.`);

        if (forms.length === 0) {
            console.log('Nenhum formulário encontrado. Encerrando.');
            return;
        }

        // Ordenar por leads_count (se disponível) ou pegar o primeiro
        const activeForms = forms.filter(f => f.status === 'ACTIVE').length > 0 ? forms.filter(f => f.status === 'ACTIVE') : forms;
        console.log(`Inspecionando os ${Math.min(3, activeForms.length)} primeiros formulários...`);

        for (const form of activeForms.slice(0, 3)) {
            console.log(`\n📄 FORMULÁRIO: ${form.name} (ID: ${form.id})`);

            // 3. Buscar Últimos Leads
            try {
                const leadsResponse = await axios.get(`${BASE_URL}/${form.id}/leads`, {
                    params: {
                        access_token: pageToken,
                        fields: 'id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,platform,retailer_item_id',
                        limit: 5 // Pegar os 5 últimos
                    }
                });

                const leads = leadsResponse.data.data || [];
                console.log(`   Encontrados ${leads.length} leads recentes.`);

                if (leads.length > 0) {
                    console.log('   🔎 AMOSTRA DE DADOS (Primeiro Lead):');
                    console.log(JSON.stringify(leads[0], null, 2));

                    // Verificar campos específicos
                    const fields = leads[0].field_data || [];
                    console.log('   📋 CAMPOS DETECTADOS:');
                    fields.forEach(f => console.log(`      - ${f.name}: ${f.values[0]}`));
                }

            } catch (leadError) {
                console.error(`   Erro ao buscar leads do formulário ${form.id}:`, leadError.response?.data?.error?.message || leadError.message);
            }
        }

    } catch (error) {
        console.error('\n❌ ERRO GERAL:', error.response?.data?.error?.message || error.message);
    }
}

inspectLeads();
