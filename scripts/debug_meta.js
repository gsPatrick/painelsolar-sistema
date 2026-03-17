const axios = require('axios');
require('dotenv').config();

const token = process.env.META_PAGE_ACCESS_TOKEN;

async function checkToken() {
    console.log('--- Diagnóstico Meta ---');
    console.log('Token detectado:', token ? (token.substring(0, 10) + '...') : 'NENHUM');
    
    if (!token) return;

    try {
        // Check token info
        const meRes = await axios.get('https://graph.facebook.com/v22.0/me', {
            params: { access_token: token, fields: 'id,name' }
        });
        console.log('✅ Token válido!');
        console.log('Conta vinculada ao token:', meRes.data.name, `(ID: ${meRes.data.id})`);

        // Check page accounts
        const accountsRes = await axios.get('https://graph.facebook.com/v22.0/me/accounts', {
            params: { access_token: token }
        });
        
        console.log('\nPáginas acessíveis:');
        accountsRes.data.data.forEach(p => {
            console.log(`- ${p.name} (ID: ${p.id})`);
            console.log(`  Permissões: ${p.tasks.join(', ')}`);
        });

    } catch (error) {
        console.error('❌ Erro ao validar token:', error.response?.data || error.message);
    }
}

checkToken();
