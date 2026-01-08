require('dotenv').config();
const axios = require('axios');

async function getPageInfo() {
    const token = process.env.META_PAGE_ACCESS_TOKEN || process.env.FB_PAGE_ACCESS_TOKEN;

    if (!token) {
        console.log('❌ Token não encontrado! Configure META_PAGE_ACCESS_TOKEN ou FB_PAGE_ACCESS_TOKEN no .env');
        return;
    }

    console.log('🔍 Verificando token do Facebook...\n');

    try {
        // First try to get user info
        const meResponse = await axios.get('https://graph.facebook.com/v22.0/me', {
            params: {
                access_token: token,
                fields: 'id,name'
            }
        });

        console.log(`👤 Usuário: ${meResponse.data.name} (ID: ${meResponse.data.id})\n`);

        // Now get the pages this user manages
        const pagesResponse = await axios.get('https://graph.facebook.com/v22.0/me/accounts', {
            params: {
                access_token: token,
                fields: 'id,name,access_token,category'
            }
        });

        const pages = pagesResponse.data.data;

        if (!pages || pages.length === 0) {
            console.log('⚠️  Este token não tem acesso a nenhuma Página do Facebook.');
            console.log('   Certifique-se de que você gerou o token com permissões de "pages_manage_ads" e "leads_retrieval".');
            return;
        }

        console.log('═══════════════════════════════════════════════');
        console.log('✅ TOKEN VÁLIDO! Páginas encontradas:');
        console.log('═══════════════════════════════════════════════\n');

        pages.forEach((page, i) => {
            console.log(`📄 [${i + 1}] ${page.name}`);
            console.log(`   🆔 Page ID: ${page.id}`);
            console.log(`   📂 Categoria: ${page.category || 'N/A'}`);
            console.log(`   🔑 Page Access Token: ${page.access_token.substring(0, 30)}...`);
            console.log('');
        });

        console.log('═══════════════════════════════════════════════');
        console.log('👆 Copie o Page ID desejado acima!');
        console.log('');
        console.log('💡 IMPORTANTE: Para receber webhooks de Lead Ads, use o');
        console.log('   PAGE ACCESS TOKEN (não o User Token) no seu .env');
        console.log('═══════════════════════════════════════════════\n');

    } catch (error) {
        console.log('═══════════════════════════════════════════════');
        console.log('❌ ERRO AO VERIFICAR TOKEN');
        console.log('═══════════════════════════════════════════════');

        if (error.response?.data?.error) {
            const fbError = error.response.data.error;
            console.log(`Tipo: ${fbError.type}`);
            console.log(`Código: ${fbError.code}`);
            console.log(`Mensagem: ${fbError.message}`);
        } else {
            console.log(error.message);
        }
        console.log('═══════════════════════════════════════════════');
    }
}

getPageInfo();
