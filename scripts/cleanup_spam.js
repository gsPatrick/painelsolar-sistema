
const { Message, Lead } = require('../src/models');
const { Op } = require('sequelize');
require('../src/config/database');

async function cleanupSpam() {
    console.log('🧹 Iniciando limpeza de mensagens spam...');

    try {
        // Look for messages sent in the last 12 hours (to catch everything)
        // Adjust this if you want to look further back
        const timeWindow = new Date(Date.now() - 12 * 60 * 60 * 1000);

        const messages = await Message.findAll({
            where: {
                sender: 'ai',
                timestamp: { [Op.gte]: timeWindow }
            },
            include: [{ model: Lead, as: 'lead', attributes: ['name', 'phone'] }],
            order: [['lead_id', 'ASC'], ['timestamp', 'ASC']]
        });

        console.log(`🔍 Encontradas ${messages.length} mensagens da IA nas últimas 12h.`);

        const idsToDelete = [];
        const spamGroups = {};

        // Group messages by Lead ID and Content (first 30 chars)
        messages.forEach(msg => {
            const key = `${msg.lead_id}-${msg.content.substring(0, 30)}`;
            if (!spamGroups[key]) spamGroups[key] = [];
            spamGroups[key].push(msg);
        });

        for (const key in spamGroups) {
            const group = spamGroups[key];
            if (group.length > 1) {
                const leadName = group[0].lead?.name || 'Cliente';
                console.log(`❌ ${leadName}: ${group.length} mensagens iguais. Mantendo 1 e apagando ${group.length - 1}.`);

                // Keep the FIRST one (index 0), delete the rest
                for (let i = 1; i < group.length; i++) {
                    idsToDelete.push(group[i].id);
                }
            }
        }

        if (idsToDelete.length > 0) {
            await Message.destroy({ where: { id: idsToDelete } });
            console.log(`\n✅ SUCESSO! ${idsToDelete.length} mensagens duplicadas foram removidas.`);
        } else {
            console.log('\n✅ Nenhuma mensagem duplicada encontrada para remover.');
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Erro durante a limpeza:', error);
        process.exit(1);
    }
}

cleanupSpam();
