const metaService = require('../src/services/MetaService');
const pageId = '534745156397254';
const pageAccessToken = process.env.META_PAGE_ACCESS_TOKEN;

async function checkAndSubscribe() {
    console.log('--- Verificação de Inscrição Meta ---');
    try {
        console.log(`Verificando aplicativos inscritos na página ${pageId}...`);
        const axios = require('axios');
        const res = await axios.get(`https://graph.facebook.com/v22.0/${pageId}/subscribed_apps`, {
            params: { access_token: pageAccessToken }
        });
        
        console.log('Aplicativos inscritos:', JSON.stringify(res.data.data, null, 2));
        
        const isSubscribed = res.data.data.some(app => app.subscribed_fields.includes('leadgen'));
        
        if (!isSubscribed) {
            console.log('⚠️ Página NÃO inscrita para leadgen. Ativando inscrição...');
            await metaService.subscribePageToLeadgen(pageId, pageAccessToken);
            console.log('✅ Inscrição realizada com sucesso!');
        } else {
            console.log('✅ Página já está inscrita para leadgen.');
        }

    } catch (error) {
        console.error('❌ Erro na verificação/inscrição:', error.response?.data || error.message);
    }
}

checkAndSubscribe();
