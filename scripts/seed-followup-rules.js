/**
 * Seed default follow-up rules for the "Primeiro Contato" pipeline
 * Rules: 1h, 3h, 24h follow-ups
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const sequelize = require('../src/config/database');
const { FollowUpRule, Pipeline } = require('../src/models');

const DEFAULT_RULES = [
    {
        step_number: 1,
        delay_hours: 1,
        message_template: 'Oi {nome}! Vi que começamos seu atendimento, mas não concluímos. Aconteceu alguma coisa ou ficou com alguma dúvida na simulação?',
    },
    {
        step_number: 2,
        delay_hours: 3,
        message_template: '{nome}, estou por aqui. Se tiver qualquer dificuldade, posso te ligar rapidamente para explicar como funciona. O que você prefere?',
    },
    {
        step_number: 3,
        delay_hours: 24,
        message_template: 'Olá {nome}, tudo bem? Não queria que você perdesse a oportunidade de reduzir sua conta. Podemos retomar de onde paramos?',
    },
];

async function seedFollowUpRules() {
    try {
        await sequelize.authenticate();
        console.log('✅ Database connected');

        // Find or create "Primeiro Contato" pipeline
        let pipeline = await Pipeline.findOne({ where: { title: 'Primeiro Contato' } });

        if (!pipeline) {
            console.log('⚠️ Pipeline "Primeiro Contato" não encontrado. Criando...');
            pipeline = await Pipeline.create({
                title: 'Primeiro Contato',
                color: '#10B981',
                order_index: 1,
                sla_limit_days: 1,
            });
        }

        console.log(`📋 Pipeline encontrado: ${pipeline.title} (ID: ${pipeline.id})`);

        // Check if rules already exist for this pipeline
        const existingRules = await FollowUpRule.count({ where: { pipeline_id: pipeline.id } });

        if (existingRules > 0) {
            console.log(`ℹ️ Já existem ${existingRules} regras para este pipeline. Pulando seed.`);
            console.log('   (Para recriar, delete as regras existentes primeiro)');
            process.exit(0);
        }

        // Create default rules
        console.log('🌱 Criando regras de follow-up padrão...');

        for (const rule of DEFAULT_RULES) {
            await FollowUpRule.create({
                pipeline_id: pipeline.id,
                step_number: rule.step_number,
                delay_hours: rule.delay_hours,
                message_template: rule.message_template,
                active: true,
            });
            console.log(`   ✓ Regra ${rule.step_number}: ${rule.delay_hours}h delay`);
        }

        console.log('✅ Seed concluído com sucesso!');
        console.log('\n📋 Regras criadas:');
        console.log('   1. 1 hora: Pergunta se aconteceu algo');
        console.log('   2. 3 horas: Oferece ligar');
        console.log('   3. 24 horas: Retomada gentil');

    } catch (error) {
        console.error('❌ Erro no seed:', error.message);
        console.error(error.stack);
    } finally {
        await sequelize.close();
        process.exit(0);
    }
}

seedFollowUpRules();
