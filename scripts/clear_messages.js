
const { Message, Lead } = require('../src/models');
require('dotenv').config({ path: '../.env' });

async function clearMessages() {
    try {
        const lead = await Lead.findOne({ where: { phone: '557182862912' } });
        if (!lead) {
            console.log('Lead not found');
            return;
        }

        console.log(`Clearing messages for lead: ${lead.name} (${lead.id})`);

        await Message.destroy({
            where: { lead_id: lead.id }
        });

        console.log('Messages cleared successfully.');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit();
    }
}

clearMessages();
