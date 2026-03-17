const { Lead } = require('../src/models');
const { Op } = require('sequelize');

async function checkAllMetaLeads() {
    console.log('--- Todos os Leads do Meta no Banco ---');
    try {
        const leads = await Lead.findAll({
            where: {
                source: 'meta_ads'
            },
            order: [['createdAt', 'DESC']],
            limit: 20
        });

        console.log(`Encontrados ${leads.length} leads do Meta.`);
        leads.forEach(l => {
            console.log(`- Lead: ${l.name} (${l.phone}), Criado em: ${l.createdAt}`);
            console.log(`  Meta ID: ${l.meta_leadgen_id}`);
        });

    } catch (error) {
        console.error('❌ Erro ao consultar banco:', error.message);
    }
}

checkAllMetaLeads();
