require('dotenv').config({ path: '../.env' });
const axios = require('axios');

async function generatePermanentToken() {
    console.log('\n════════════════════════════════════════════════════════════');
    console.log('♾️  GERADOR DE TOKEN METAS (INFINITO)');
    console.log('════════════════════════════════════════════════════════════');

    const shortLivedToken = process.argv[2];

    if (!shortLivedToken) {
        console.error('❌ Erro: Forneça o token de curta duração como argumento.');
        console.log('👉 Uso: node scripts/generate_permanent_token.js <SEU_TOKEN_CURTO>');
        process.exit(1);
    }

    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;

    if (!appId || !appSecret) {
        console.error('❌ Erro: META_APP_ID ou META_APP_SECRET não encontrados no .env');
        process.exit(1);
    }

    try {
        console.log('⏳ 1. Trocando token curto por token longo de usuário...');

        // Step 1: Exchange Short-Lived User Token for Long-Lived User Token
        const exchangeUrl = `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`;

        const exchangeResponse = await axios.get(exchangeUrl);
        const longLivedUserToken = exchangeResponse.data.access_token;

        console.log('✅ Token de usuário longo gerado com sucesso!');

        console.log('⏳ 2. Buscando Token de Página (Infinito)...');

        // Step 2: Use Long-Lived User Token to get Long-Lived Page Token
        const accountsUrl = `https://graph.facebook.com/v18.0/me/accounts?access_token=${longLivedUserToken}`;
        const accountsResponse = await axios.get(accountsUrl);

        const pages = accountsResponse.data.data;

        if (pages.length === 0) {
            console.warn('⚠️ Nenhuma página encontrada para este usuário.');
            return;
        }

        console.log('\n✅ SUCESSO! AQUI ESTÃO SEUS TOKENS INFINITOS:');
        console.log('════════════════════════════════════════════════════════════');

        pages.forEach(page => {
            console.log(`📄 Página: \x1b[36m${page.name}\x1b[0m (ID: ${page.id})`);
            console.log(`🔑 Token Permanente:`);
            console.log(`\x1b[32m${page.access_token}\x1b[0m`);
            console.log('------------------------------------------------------------');
        });

        console.log('👉 Copie o token acima e atualize a variável META_PAGE_ACCESS_TOKEN no seu .env');
        console.log('════════════════════════════════════════════════════════════\n');

    } catch (error) {
        console.error('❌ Erro ao gerar token:');
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error(`Mensagem: ${JSON.stringify(error.response.data, null, 2)}`);
        } else {
            console.error(error.message);
        }
    }
}

generatePermanentToken();
