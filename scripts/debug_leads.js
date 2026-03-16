const { Lead, Pipeline, Message } = require('./src/models');
const { Op } = require('sequelize');
const sequelize = require('./src/config/database');

async function debugLeads() {
    try {
        console.log('--- DEBUG LEADS ---');

        // 1. Check Total Active Leads
        const totalActive = await Lead.count({ where: { status: 'active' } });
        console.log(`Total Active Leads: ${totalActive}`);

        // 2. Check AI Status Distribution
        const aiStatuses = await Lead.findAll({
            attributes: ['ai_status', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
            group: ['ai_status']
        });
        console.log('\nAI Status Distribution:', aiStatuses.map(s => s.toJSON()));

        // 3. Check "Approval" Candidates (Not Active)
        const approvalCandidates = await Lead.findAll({
            where: {
                status: 'active',
                ai_status: { [Op.ne]: 'active' },
                [Op.or]: [{ ai_status: { [Op.ne]: null } }]
            },
            limit: 5
        });
        console.log(`\nPotential Approval Leads (First 5): ${approvalCandidates.length}`);
        if (approvalCandidates.length > 0) {
            console.log(approvalCandidates.map(l => `${l.name} (${l.ai_status})`).join(', '));
        }

        // 4. Check "Pending" Candidates (Delayed > 24h)
        // Simulate criteria from FollowUpService
        const pendingCandidates = await Lead.findAll({
            where: {
                status: 'active',
                [Op.or]: [
                    { ai_status: 'active' },
                    { ai_status: null },
                    { ai_status: '' }
                ]
            },
            include: ['pipeline'],
            limit: 10
        });

        console.log('\nChecking first 10 active leads for delay criteria:');
        for (const lead of pendingCandidates) {
            const lastMessage = await Message.findOne({
                where: { lead_id: lead.id },
                order: [['timestamp', 'DESC']],
            });

            const fromAI = lastMessage && lastMessage.sender === 'ai';
            const fromUser = lastMessage && lastMessage.sender !== 'ai';

            let referenceTime = lead.last_interaction_at ? new Date(lead.last_interaction_at) : new Date(lead.updatedAt);
            if (lastMessage) referenceTime = new Date(lastMessage.timestamp);

            const hoursSince = (new Date() - referenceTime) / (1000 * 60 * 60);

            console.log(`Lead: ${lead.name} | Pipeline: ${lead.pipeline?.title} | Hours: ${hoursSince.toFixed(1)}h | LastMsg: ${lastMessage ? lastMessage.sender : 'None'}`);

            if (fromUser) console.log(' -> SKYPED (User responded)');
            else if (hoursSince > 24) console.log(' -> MATCH (Delayed)');
            else console.log(' -> RECENT (Wait)');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sequelize.close();
    }
}

debugLeads();
