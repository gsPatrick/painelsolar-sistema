const { Lead } = require('../src/models');
const { Op } = require('sequelize');

async function checkLeadsToday() {
    console.log('--- Leads Criados Recentemente (Últimas 48h) ---');
    try {
        const yesterday = new Date();
        yesterday.setHours(yesterday.getHours() - 48);

        const leads = await Lead.findAll({
            where: {
                createdAt: { [Op.gte]: yesterday }
            },
            order: [['createdAt', 'DESC']]
        });

        console.log(`Encontrados ${leads.length} leads nas últimas 48h.\n`);
        
        leads.forEach(l => {
            console.log(`- Lead: ${l.name} (${l.phone})`);
            console.log(`  Criado em: ${l.createdAt}`);
            console.log(`  Fonte: ${l.source}`);
            console.log(`---`);
        });

    } catch (error) {
        console.error('❌ Erro:', error.message);
    }
}

checkLeadsToday();
