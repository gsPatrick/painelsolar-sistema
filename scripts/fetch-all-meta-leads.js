/**
 * META ADS LEAD DIAGNOSTIC SCRIPT
 * Verifica token e lista todos os leads dos formulários
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs');

const API_VERSION = 'v22.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;
const ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN || process.env.FB_PAGE_ACCESS_TOKEN;

async function main() {
    console.log('\n' + '═'.repeat(60));
    console.log('🔍 META ADS LEAD DIAGNOSTIC SCRIPT');
    console.log('═'.repeat(60) + '\n');

    if (!ACCESS_TOKEN) {
        console.error('❌ Token não encontrado!');
        console.error('   Configure META_PAGE_ACCESS_TOKEN ou FB_PAGE_ACCESS_TOKEN no .env');
        process.exit(1);
    }

    console.log(`📍 Token: ${ACCESS_TOKEN.substring(0, 30)}...`);
    console.log('');

    try {
        // STEP 1: Get User/Page Info
        console.log('📋 PASSO 1: Verificando identidade...');
        const meResponse = await axios.get(`${BASE_URL}/me`, {
            params: { access_token: ACCESS_TOKEN, fields: 'id,name' }
        });
        console.log(`   ✅ Usuário: ${meResponse.data.name} (ID: ${meResponse.data.id})\n`);

        // STEP 2: Get Pages
        console.log('📋 PASSO 2: Buscando páginas...');
        const pagesResponse = await axios.get(`${BASE_URL}/me/accounts`, {
            params: { access_token: ACCESS_TOKEN, fields: 'id,name,access_token' }
        });

        const pages = pagesResponse.data.data || [];
        console.log(`   ✅ ${pages.length} página(s) encontrada(s)\n`);

        if (pages.length === 0) {
            console.error('❌ Nenhuma página encontrada. O token tem permissão pages_read_engagement?');
            process.exit(1);
        }

        const allData = {
            timestamp: new Date().toISOString(),
            user: meResponse.data,
            pages: [],
        };

        let totalForms = 0;
        let totalLeads = 0;

        // For each page
        for (const page of pages) {
            console.log(`\n📄 PÁGINA: ${page.name} (ID: ${page.id})`);
            console.log('─'.repeat(50));

            const pageData = {
                id: page.id,
                name: page.name,
                forms: [],
            };

            // STEP 3: Get Forms for this page
            console.log('   📋 PASSO 3: Buscando formulários...');
            try {
                const formsResponse = await axios.get(`${BASE_URL}/${page.id}/leadgen_forms`, {
                    params: {
                        access_token: page.access_token,
                        fields: 'id,name,status,leads_count,created_time'
                    }
                });

                const forms = formsResponse.data.data || [];
                console.log(`   ✅ ${forms.length} formulário(s) encontrado(s)`);
                totalForms += forms.length;

                // For each form
                for (const form of forms) {
                    console.log(`\n   📝 Formulário: ${form.name}`);
                    console.log(`      ID: ${form.id}`);
                    console.log(`      Status: ${form.status}`);
                    console.log(`      Leads (estimado): ${form.leads_count || 'N/A'}`);

                    const formData = {
                        id: form.id,
                        name: form.name,
                        status: form.status,
                        leads_count: form.leads_count,
                        leads: [],
                    };

                    // STEP 4: Get Leads from this form
                    console.log('      🔍 Buscando leads...');
                    try {
                        const leadsResponse = await axios.get(`${BASE_URL}/${form.id}/leads`, {
                            params: {
                                access_token: page.access_token,
                                fields: 'id,created_time,field_data,ad_id',
                                limit: 100
                            }
                        });

                        const leads = leadsResponse.data.data || [];
                        console.log(`      ✅ ${leads.length} lead(s) encontrado(s)`);
                        totalLeads += leads.length;

                        // Parse leads
                        for (const lead of leads) {
                            const parsedLead = {
                                id: lead.id,
                                created_time: lead.created_time,
                                ad_id: lead.ad_id,
                                fields: {}
                            };

                            // Parse field_data
                            if (lead.field_data) {
                                for (const field of lead.field_data) {
                                    parsedLead.fields[field.name] = field.values?.[0] || null;
                                }
                            }

                            formData.leads.push(parsedLead);

                            // Log lead details
                            const name = parsedLead.fields.full_name || parsedLead.fields.nome || parsedLead.fields.name || 'N/A';
                            const phone = parsedLead.fields.phone_number || parsedLead.fields.telefone || parsedLead.fields.phone || 'N/A';
                            console.log(`         → ${name} | ${phone} | ${lead.created_time}`);
                        }

                    } catch (leadsError) {
                        handleApiError(leadsError, '      ❌ Erro ao buscar leads');
                    }

                    pageData.forms.push(formData);
                }

            } catch (formsError) {
                handleApiError(formsError, '   ❌ Erro ao buscar formulários');
            }

            allData.pages.push(pageData);
        }

        // Summary
        console.log('\n' + '═'.repeat(60));
        console.log('📊 RESUMO');
        console.log('═'.repeat(60));
        console.log(`   📄 Páginas: ${pages.length}`);
        console.log(`   📝 Formulários: ${totalForms}`);
        console.log(`   👤 Leads: ${totalLeads}`);
        console.log('');

        // Save to file
        const outputPath = './meta_leads_dump.json';
        fs.writeFileSync(outputPath, JSON.stringify(allData, null, 2));
        console.log(`💾 Dados salvos em: ${outputPath}`);
        console.log('═'.repeat(60) + '\n');

    } catch (error) {
        handleApiError(error, '❌ Erro geral');
        process.exit(1);
    }
}

function handleApiError(error, prefix) {
    console.error(prefix);

    if (error.response?.data?.error) {
        const fbError = error.response.data.error;
        console.error(`   Tipo: ${fbError.type}`);
        console.error(`   Código: ${fbError.code}`);
        console.error(`   Mensagem: ${fbError.message}`);

        // Common errors
        if (fbError.code === 190) {
            console.error('\n   💡 SOLUÇÃO: Token expirado ou inválido. Gere um novo token.');
        } else if (fbError.code === 100) {
            console.error('\n   💡 SOLUÇÃO: Permissão negada. Verifique se o app tem "leads_retrieval" e "pages_manage_ads".');
        } else if (fbError.code === 200) {
            console.error('\n   💡 SOLUÇÃO: Falta permissão. Adicione as permissões no App Review.');
        }
    } else {
        console.error(`   ${error.message}`);
    }
}

main();
