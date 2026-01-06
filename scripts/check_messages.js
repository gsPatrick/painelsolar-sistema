
const { Message, Lead } = require('../src/models');
require('dotenv').config({ path: '../.env' });

async function checkMessages() {
    try {
        const lead = await Lead.findOne({ where: { phone: '557182862912' } });
        if (!lead) {
            console.log('Lead not found');
            return;
        }

        console.log(`Checking messages for lead: ${lead.name} (${lead.id})`);

        const messages = await Message.findAll({
            where: { lead_id: lead.id },
            order: [['timestamp', 'DESC']],
            limit: 20
        });

        messages.forEach(msg => {
            console.log(`[${msg.sender.toUpperCase()}] ${msg.timestamp.toISOString()}: ${msg.content.substring(0, 50)}...`);
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit();
    }
}

checkMessages();
