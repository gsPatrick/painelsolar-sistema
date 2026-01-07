
const { Pipeline } = require('../src/models');
require('dotenv').config({ path: '../.env' });

const DEFAULT_PIPELINES = [
    { title: 'Entrada', color: '#64748B', order_index: 0, sla_limit_days: 1 },         // Slate-500 (Gray/Input)
    { title: 'Primeiro Contato', color: '#F59E0B', order_index: 1, sla_limit_days: 2 }, // Amber-500 (Orange/Contact)
    { title: 'Negociação', color: '#0EA5E9', order_index: 2, sla_limit_days: 5 },       // Sky-500 (Blue/Negotiation)
    { title: 'Agendamento', color: '#F97316', order_index: 3, sla_limit_days: 3 },      // Orange-500 (Deep Orange/Schedule)
    { title: 'Fechamento', color: '#10B981', order_index: 4, sla_limit_days: 2 },       // Emerald-500 (Green/Closing)
    { title: 'Pós Venda', color: '#8B5CF6', order_index: 5, sla_limit_days: 7 }         // Violet-500 (Purple/Post-sale)
];

async function seedPipelines() {
    try {
        console.log('Seeding default pipelines...');

        // Check if we have any pipelines
        const count = await Pipeline.count();
        if (count > 0) {
            console.log(`Found ${count} existing pipelines. Checking for defaults...`);
            // We won't delete all to preserve data integrity if leads exist, 
            // but we will ensure these specific ones exist.
            // For now, let's just create them if they don't exist by title.
        }

        for (const p of DEFAULT_PIPELINES) {
            const [pipeline, created] = await Pipeline.findOrCreate({
                where: { title: p.title },
                defaults: p
            });

            if (created) {
                console.log(`Created pipeline: ${p.title}`);
            } else {
                // Update order and color if exists? Maybe just order.
                pipeline.order_index = p.order_index;
                pipeline.color = p.color;
                await pipeline.save();
                console.log(`Updated pipeline: ${p.title}`);
            }
        }

        console.log('Pipelines seeded successfully.');

    } catch (error) {
        console.error('Error seeding pipelines:', error);
    } finally {
        process.exit();
    }
}

seedPipelines();
