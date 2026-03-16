const axios = require('axios');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
const envPath = path.join(__dirname, '../.env');
if (!fs.existsSync(envPath)) {
    console.error('❌ Arquivo .env não encontrado em:', envPath);
    process.exit(1);
}

const envConfig = dotenv.parse(fs.readFileSync(envPath));

const appId = envConfig.META_APP_ID;
const appSecret = envConfig.META_APP_SECRET;

if (!appId || !appSecret) {
    console.error('❌ META_APP_ID ou META_APP_SECRET não configurados no .env');
    process.exit(1);
}

const shortLivedToken = process.argv[2];

if (!shortLivedToken) {
    console.log('\n🚀 Modos de uso:');
    console.log('node scripts/refreshMetaToken.js <SEU_TOKEN_TEMPORARIO>');
    process.exit(1);
}

async function refresh() {
    console.log('🔄 Iniciando processo de renovação de token...');
    
    try {
        // 1. Exchange for long-lived token (60 days)
        console.log('📡 Trocando por token de longa duração...');
        const exchangeRes = await axios.get(`https://graph.facebook.com/v22.0/oauth/access_token`, {
            params: {
                grant_type: 'fb_exchange_token',
                client_id: appId,
                client_secret: appSecret,
                fb_exchange_token: shortLivedToken
            }
        });
        
        const longLivedToken = exchangeRes.data.access_token;
        console.log('✅ Token de longa duração obtido.');

        // 2. Get Page Access Token (Permanent)
        console.log('📡 Buscando Token de Página Permanente...');
        const meRes = await axios.get(`https://graph.facebook.com/v22.0/me/accounts`, {
            params: { access_token: longLivedToken }
        });

        const pages = meRes.data.data;
        if (!pages || pages.length === 0) {
            throw new Error('Nenhuma página do Facebook encontrada para este usuário.');
        }

        // We take the first page or the one matching a specific ID if we had it
        const page = pages[0];
        const permanentToken = page.access_token;
        console.log(`✅ Token permanente obtido para a página: ${page.name} (${page.id})`);

        // 3. Update .env file
        console.log('💾 Atualizando arquivo .env...');
        let envContent = fs.readFileSync(envPath, 'utf8');
        
        // Find if META_PAGE_ACCESS_TOKEN or FB_PAGE_ACCESS_TOKEN exists
        const metaRegex = /^META_PAGE_ACCESS_TOKEN=.*$/m;
        const fbRegex = /^FB_PAGE_ACCESS_TOKEN=.*$/m;

        if (metaRegex.test(envContent)) {
            envContent = envContent.replace(metaRegex, `META_PAGE_ACCESS_TOKEN=${permanentToken}`);
        } else if (fbRegex.test(envContent)) {
            envContent = envContent.replace(fbRegex, `META_PAGE_ACCESS_TOKEN=${permanentToken}`);
        } else {
            envContent += `\nMETA_PAGE_ACCESS_TOKEN=${permanentToken}`;
        }

        fs.writeFileSync(envPath, envContent);
        console.log('✨ SUCESSO! Token permanente configurado no .env.');
        console.log('🔔 Lembre-se de reiniciar o servidor para aplicar as alterações.');

    } catch (error) {
        console.error('❌ Erro no processo:', error.response?.data || error.message);
    }
}

refresh();
