const { Lead, Pipeline, Message } = require('../models');
const { Op } = require('sequelize');

async function debugLeads() {
    try {
        console.log('--- Debugging Leads ---');

        // 1. Find Proposta Pipeline
        const pipelines = await Pipeline.findAll({
            where: {
                title: { [Op.like]: '%Proposta%' }
            }
        });

        if (pipelines.length === 0) {
            console.log('No pipeline found with name containing "Proposta"');
            return;
        }

        console.log('Found Pipelines matching "Proposta":');
        pipelines.forEach(p => console.log(`- ID: ${p.id}, Title: ${p.title}`));

        // 2. Inspet Leads for these pipelines
        for (const pipeline of pipelines) {
            console.log(`\nChecking Leads in Pipeline: ${pipeline.title} (${pipeline.id})`);

            const leads = await Lead.findAll({
                where: { pipeline_id: pipeline.id },
                include: [{ model: Message, as: 'messages', limit: 1, order: [['timestamp', 'DESC']] }]
            });

            console.log(`Found ${leads.length} leads.`);

            for (const lead of leads) {
                const lastMsg = lead.messages && lead.messages[0];
                const lastSender = lastMsg ? lastMsg.sender : 'N/A';
                const lastContent = lastMsg ? lastMsg.content.substring(0, 30) : 'N/A';

                let referenceTime = lead.last_interaction_at ? new Date(lead.last_interaction_at) : new Date(lead.updatedAt);
                if (lastMsg) referenceTime = new Date(lastMsg.timestamp);

                const hoursSince = (new Date() - referenceTime) / (1000 * 60 * 60);

                console.log(`  Lead: ${lead.name} (ID: ${lead.id})`);
                console.log(`    - Status: ${lead.status}, AI Status: ${lead.ai_status}`);
                console.log(`    - Last Interaction: ${hoursSince.toFixed(2)}h ago`);
                console.log(`    - Last Msg Sender: ${lastSender} ("${lastContent}...")`);

                // Simulation of Logic
                if (lastSender !== 'ai' && lastSender !== 'N/A') {
                    console.log(`    -> WOULD SKIP: User responded.`);
                } else {
                    console.log(`    -> CANDIDATE for Follow-up.`);
                }
            }
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

debugLeads();
