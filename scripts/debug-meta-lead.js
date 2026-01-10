require('dotenv').config({ path: '../.env' });
const axios = require('axios');

const ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;
const API_VERSION = 'v22.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

const leadId = process.argv[2];

if (!ACCESS_TOKEN) {
    console.error('❌ ERRO: META_PAGE_ACCESS_TOKEN não encontrado no .env');
    process.exit(1);
}

if (!leadId) {
    console.error('❌ ERRO: Forneça o ID do Lead como argumento.');
    console.log('Exemplo: node debug-meta-lead.js <LEAD_GEN_ID>');
    process.exit(1);
}

async function inspectLead() {
    try {
        console.log(`🔍 Inspecionando Lead ID: ${leadId}...\n`);

        // 1. Fetch Basic Lead Data
        console.log('--- 1. DADOS DO LEAD (RAW) ---');
        const leadResponse = await axios.get(`${BASE_URL}/${leadId}`, {
            params: {
                access_token: ACCESS_TOKEN,
                fields: 'id,created_time,ad_id,form_id,field_data,campaign_name,platform,retailer_item_id'
            }
        });
        console.log(JSON.stringify(leadResponse.data, null, 2));

        const leadData = leadResponse.data;

        // 2. Fetch Ad Data (if ad_id exists)
        if (leadData.ad_id) {
            console.log('\n--- 2. DADOS DO ANÚNCIO (AD) ---');
            try {
                const adResponse = await axios.get(`${BASE_URL}/${leadData.ad_id}`, {
                    params: {
                        access_token: ACCESS_TOKEN,
                        fields: 'name,campaign,adset,creative'
                    }
                });
                console.log(JSON.stringify(adResponse.data, null, 2));

                // 3. Fetch Campaign Data
                if (adResponse.data.campaign && adResponse.data.campaign.id) {
                    console.log('\n--- 3. DADOS DA CAMPANHA ---');
                    const campaignResponse = await axios.get(`${BASE_URL}/${adResponse.data.campaign.id}`, {
                        params: {
                            access_token: ACCESS_TOKEN,
                            fields: 'name,objective,status'
                        }
                    });
                    console.log(JSON.stringify(campaignResponse.data, null, 2));
                }

            } catch (adError) {
                console.error('Erro ao buscar dados do anúncio:', adError.response?.data?.error?.message || adError.message);
            }
        } else {
            console.log('\n⚠️ Lead sem ad_id (pode ter vindo de teste ou orgânico).');
        }

        // 4. Fetch Form Data
        if (leadData.form_id) {
            console.log('\n--- 4. DADOS DO FORMULÁRIO ---');
            try {
                const formResponse = await axios.get(`${BASE_URL}/${leadData.form_id}`, {
                    params: {
                        access_token: ACCESS_TOKEN,
                        fields: 'name,status,leads_count'
                    }
                });
                console.log(JSON.stringify(formResponse.data, null, 2));
            } catch (formError) {
                console.error('Erro ao buscar formulário:', formError.response?.data?.error?.message || formError.message);
            }
        }

    } catch (error) {
        console.error('\n❌ ERRO CRÍTICO:', error.response?.data || error.message);
    }
}

inspectLead();
