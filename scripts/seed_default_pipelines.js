
const { Pipeline } = require('../src/models');
require('dotenv').config({ path: '../.env' });

const DEFAULT_PIPELINES = [
    { title: 'Entrada', color: '#64748B', order_index: 0, sla_limit_days: 1 },         // Slate-500 (Gray/Input)
    { title: 'Primeiro Contato', color: '#F59E0B', order_index: 1, sla_limit_days: 2 }, // Amber-500 (Orange/Contact)
    { title: 'Aguardando Proposta', color: '#0EA5E9', order_index: 2, sla_limit_days: 3 }, // Sky-500 (Blue/Waiting Proposal)
    { title: 'Proposta Enviada', color: '#EA580C', order_index: 3, sla_limit_days: 5 },  // Orange-600 (Dark Orange/Proposal Sent)
    { title: 'Agendamento', color: '#8B5CF6', order_index: 4, sla_limit_days: 3 },      // Violet-500 (Purple/Schedule)
    { title: 'Fechamento', color: '#10B981', order_index: 5, sla_limit_days: 2 },       // Emerald-500 (Green/Closing)
    { title: 'Pós-Venda', color: '#7C3AED', order_index: 6, sla_limit_days: 7 }         // Violet-600 (Deep Purple/Post-sale)
];

async function seedPipelines() {
    try {
        console.log('Seeding default pipelines...');

        // 1. Create or Update Default Pipelines
        for (const p of DEFAULT_PIPELINES) {
            const [pipeline, created] = await Pipeline.findOrCreate({
                where: { title: p.title },
                defaults: p
            });

            if (created) {
                console.log(`Created pipeline: ${p.title}`);
            } else {
                pipeline.order_index = p.order_index;
                pipeline.color = p.color;
                pipeline.sla_limit_days = p.sla_limit_days; // Update SLA too
                await pipeline.save();
                console.log(`Updated pipeline: ${p.title}`);
            }
        }

        // 2. Remove any pipeline NOT in the default list
        const allowedTitles = DEFAULT_PIPELINES.map(p => p.title);
        const { Op } = require('sequelize');
        
        const removedCount = await Pipeline.destroy({
            where: {
                title: { [Op.notIn]: allowedTitles }
            }
        });

        if (removedCount > 0) {
            console.log(`Removed ${removedCount} deprecated pipelines.`);
        }

        console.log('Pipelines seeded successfully.');

    } catch (error) {
        console.error('Error seeding pipelines:', error);
    } finally {
        process.exit();
    }
}

seedPipelines();
