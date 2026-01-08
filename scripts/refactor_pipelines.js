require('dotenv').config();
const { Pipeline, Lead } = require('../src/models');
const sequelize = require('../src/config/database');

const NEW_PIPELINES = [
    { title: 'Entrada', color: '#64748B', sla: 1 }, // Slate-500
    { title: 'Primeiro Contato', color: '#3B82F6', sla: 2 }, // Blue-500
    { title: 'Aguardando Proposta', color: '#F59E0B', sla: 3 }, // Amber-500
    { title: 'Proposta Enviada', color: '#8B5CF6', sla: 5 }, // Violet-500
    { title: 'Agendamento', color: '#EC4899', sla: 7 }, // Pink-500
    { title: 'Fechamento', color: '#10B981', sla: 10 }, // Emerald-500
    { title: 'Pós-Venda', color: '#6366F1', sla: 30 } // Indigo-500
];

async function refactorPipelines() {
    try {
        await sequelize.authenticate();
        console.log('✅ Database connected.');

        // 1. Create temporary fallback pipeline to hold leads during transition
        const [tempPipeline] = await Pipeline.findOrCreate({
            where: { title: 'TEMP_SEGURO' },
            defaults: { color: '#000000', order_index: 999 }
        });
        console.log(`🛡️  Created/Found temporary pipeline: ${tempPipeline.id}`);

        // 2. Move ALL leads to this temp pipeline safely
        const updatedLeads = await Lead.update(
            { pipeline_id: tempPipeline.id },
            { where: {} }
        );
        console.log(`📦 Moved ${updatedLeads[0]} leads to temporary safety.`);

        // 3. Delete ALL other pipelines
        const deletedCount = await Pipeline.destroy({
            where: {
                id: { [require('sequelize').Op.ne]: tempPipeline.id } // Not equal to temp
            }
        });
        console.log(`🗑️  Deleted ${deletedCount} old pipelines.`);

        // 4. Create NEW pipelines in order
        const createdPipelines = {};
        for (let i = 0; i < NEW_PIPELINES.length; i++) {
            const p = NEW_PIPELINES[i];
            const newPipe = await Pipeline.create({
                title: p.title,
                color: p.color,
                order_index: i,
                sla_limit_days: p.sla
            });
            createdPipelines[p.title] = newPipe;
            console.log(`✨ Created new pipeline: ${p.title}`);
        }

        // 5. Move leads from Temp to 'Entrada'
        const entradaId = createdPipelines['Entrada'].id;
        await Lead.update(
            { pipeline_id: entradaId },
            { where: { pipeline_id: tempPipeline.id } }
        );
        console.log(`🚀 Migrated all leads to 'Entrada' pipeline.`);

        // 6. Delete temp pipeline
        await tempPipeline.destroy();
        console.log('🧹 Cleaned up temporary pipeline.');

        console.log('\n✅ PIPELINE REFACTOR COMPLETE!');

    } catch (error) {
        console.error('❌ Error refactoring pipelines:', error);
    } finally {
        await sequelize.close();
    }
}

refactorPipelines();
