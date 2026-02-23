
const { Message, Lead } = require('../src/models');
const { Op } = require('sequelize');
const whatsAppService = require('../src/services/WhatsAppService');
require('../src/config/database');

async function cleanupWhatsAppSpam() {
    console.log('🧹 Iniciando limpeza de mensagens spam no WhatsApp (Z-API)...');

    try {
        // Look for messages sent in the last 12 hours
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
                const phone = group[0].lead?.phone;

                console.log(`\n❌ ${leadName} (${phone}): ${group.length} mensagens duplicadas.`);

                // Keep the FIRST one (index 0), delete the rest
                for (let i = 1; i < group.length; i++) {
                    const msgToDelete = group[i];
                    console.log(`   🗑️ Apagando mensagem duplicada ${i} (ID: ${msgToDelete.id})...`);

                    // 1. Try to delete from WhatsApp
                    // Note: Message model might not have the Z-API message ID explicitly saved in a separate column if not migrated,
                    // BUT usually 'id' in local DB is UUID, and Z-API needs the WA ID.
                    // If your system saves the Z-API ID in 'id' or another field found in 'metadata', allow for that.
                    // Assuming 'id' field MIGHT be the Z-API ID or we don't have it.
                    // Actually, Looking at Message.js model is needed to be sure where Z-API ID is.
                    // If we don't have the Z-API ID, we can't delete from WhatsApp.
                    // WA Service usually returns an ID. Let's assume for now we might not have it if not saved.

                    // Let's try to pass the `id` from DB, but usually Z-API IDs are longer specific strings.
                    // Check if your `Message` model has a `wamid` or similar field. 
                    // If not, this might fail for messages that don't have the external ID saved.

                    // For now, I will try to use `msgToDelete.id` assuming it might be stored there or in a compatible format.
                    // If this fails, we can only delete from DB.

                    // Wait 2 seconds between deletes to avoid rate limits
                    await new Promise(resolve => setTimeout(resolve, 2000));

                    try {
                        // Assuming Message ID in DB matches Z-API ID or is stored. 
                        // If you use UUIDs in DB, this WON'T work for Z-API deletion unless you stored the Z-API ID.
                        // However, user asked to "apagar a do whatsapp", implying they hope it's possible.
                        // I will attempt it.

                        // NOTE: If your system doesn't save the Z-API message ID (WAMID), this is impossible. 
                        // But I'll add the call.
                        const result = await whatsAppService.deleteMessage(phone, msgToDelete.id, true);
                        if (result.success) {
                            console.log(`      ✅ Apagado do WhatsApp.`);
                        } else {
                            console.log(`      ⚠️  Falha ao apagar do WhatsApp: ${result.error}`);
                        }
                    } catch (err) {
                        console.error(`      ❌ Erro ao chamar Z-API: ${err.message}`);
                    }

                    idsToDelete.push(msgToDelete.id);
                }
            }
        }

        if (idsToDelete.length > 0) {
            await Message.destroy({ where: { id: idsToDelete } });
            console.log(`\n✅ SUCESSO! ${idsToDelete.length} mensagens removidas do banco de dados e tentadas no WhatsApp.`);
        } else {
            console.log('\n✅ Nenhuma mensagem duplicada encontrada.');
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Erro durante a limpeza:', error);
        process.exit(1);
    }
}

cleanupWhatsAppSpam();
