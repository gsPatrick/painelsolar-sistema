const { Lead, Message } = require('../src/models');
const { Op } = require('sequelize');

async function checkSpecificLeads() {
    const phones = ['5571996992688', '5571996703571', '5571986842577'];
    console.log('--- Verificando Status dos Leads Específicos ---');
    
    try {
        const leads = await Lead.findAll({
            where: {
                phone: { [Op.in]: phones }
            },
            include: [{ model: Message, as: 'messages', limit: 5, order: [['createdAt', 'DESC']] }]
        });

        console.log(`Encontrados ${leads.length} leads no banco.`);
        
        leads.forEach(l => {
            console.log(`- Lead: ${l.name} (${l.phone})`);
            console.log(`  ID: ${l.id}, Fonte: ${l.source}, Status: ${l.status}`);
            console.log(`  Meta ID: ${l.meta_leadgen_id}`);
            console.log(`  Criado em: ${l.createdAt}`);
            console.log(`  Mensagens: ${l.messages.length} recentes.`);
            l.messages.forEach(m => {
                console.log(`    [${m.sender}] ${m.content.substring(0, 50)}...`);
            });
            console.log('---');
        });

    } catch (error) {
        console.error('❌ Erro:', error.message);
    }
}

checkSpecificLeads();
