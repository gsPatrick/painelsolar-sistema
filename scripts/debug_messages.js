const { Message, Lead } = require('./src/models');
const sequelize = require('./src/config/database');

async function checkMessages() {
    try {
        console.log('Checking recent messages...');
        const messages = await Message.findAll({
            limit: 20,
            order: [['timestamp', 'DESC']],
            include: [{ model: Lead, as: 'lead', attributes: ['name'] }]
        });

        if (messages.length === 0) {
            console.log('No messages found in database.');
        } else {
            console.log(`Found ${messages.length} messages. Here are the last 10:`);
            messages.forEach(msg => {
                console.log(`[${msg.sender}] ${msg.lead?.name}: ${msg.content.substring(0, 50)}...`);
            });
        }
    } catch (error) {
        console.error('Error checking messages:', error);
    } finally {
        await sequelize.close();
    }
}

checkMessages();
