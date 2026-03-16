/**
 * Seed default follow-up rules for Entrada and Proposta Enviada
 */

require('dotenv').config();
const sequelize = require('../src/config/database');
const { FollowUpRule, Pipeline } = require('../src/models');

const ENTRADA_RULES = [
    { step: 1, delay: 1, message: 'Olá {nome}! Vi que você demonstrou interesse em energia solar. Posso te ajudar? 😊' },
    { step: 2, delay: 3, message: 'Oi {nome}, ainda está aí? Fico à disposição para tirar suas dúvidas sobre energia solar! ☀️' },
    { step: 3, delay: 24, message: '{nome}, passando para lembrar que tenho uma proposta especial esperando por você. Quer saber mais? 📋' },
    { step: 4, delay: 48, message: 'Olá {nome}! Não quero ser insistente, mas percebi que você ainda não respondeu. Tudo bem por aí? 🤔' },
    { step: 5, delay: 72, message: '{nome}, última tentativa! Se mudar de ideia, é só me chamar. A economia com energia solar pode chegar a 95%! ⚡' },
];

const PROPOSTA_RULES = [
    { step: 1, delay: 24, message: 'Olá {nome}! Conseguiu avaliar a proposta que enviei? Fico à disposição para esclarecer qualquer dúvida! 😊' },
    { step: 2, delay: 72, message: '{nome}, passando para saber se você teve tempo de analisar nossa proposta. Posso agendar uma visita técnica para explicar melhor? 📍' },
    { step: 3, delay: 168, message: 'Oi {nome}! A proposta ainda está válida. Que tal marcarmos uma conversa para fecharmos negócio? O investimento se paga em poucos anos! 💰' },
];

async function seedFollowupRules() {
    try {
        await sequelize.authenticate();
        console.log('✅ Database connected');

        // Find pipelines
        const pipelines = await Pipeline.findAll();
        console.log(`📊 Found ${pipelines.length} pipelines`);

        const entradaPipeline = pipelines.find(p =>
            p.title.toLowerCase().includes('entrada') ||
            p.title.toLowerCase().includes('primeiro contato')
        );

        const propostaPipeline = pipelines.find(p =>
            p.title.toLowerCase().includes('proposta')
        );

        if (!entradaPipeline) {
            console.log('⚠️ Entrada/Primeiro Contato pipeline not found');
        } else {
            console.log(`📥 Found Entrada pipeline: ${entradaPipeline.title} (${entradaPipeline.id})`);

            // Check existing rules
            const existingEntrada = await FollowUpRule.count({ where: { pipeline_id: entradaPipeline.id } });
            if (existingEntrada > 0) {
                console.log(`   ⏭️ Already has ${existingEntrada} rules, skipping...`);
            } else {
                // Create rules
                for (const rule of ENTRADA_RULES) {
                    await FollowUpRule.create({
                        pipeline_id: entradaPipeline.id,
                        step_number: rule.step,
                        delay_hours: rule.delay,
                        message_template: rule.message,
                        active: true
                    });
                    console.log(`   ✅ Created rule #${rule.step}: ${rule.delay}h`);
                }
            }
        }

        if (!propostaPipeline) {
            console.log('⚠️ Proposta Enviada pipeline not found');
        } else {
            console.log(`📋 Found Proposta pipeline: ${propostaPipeline.title} (${propostaPipeline.id})`);

            // Check existing rules
            const existingProposta = await FollowUpRule.count({ where: { pipeline_id: propostaPipeline.id } });
            if (existingProposta > 0) {
                console.log(`   ⏭️ Already has ${existingProposta} rules, skipping...`);
            } else {
                // Create rules
                for (const rule of PROPOSTA_RULES) {
                    await FollowUpRule.create({
                        pipeline_id: propostaPipeline.id,
                        step_number: rule.step,
                        delay_hours: rule.delay,
                        message_template: rule.message,
                        active: true
                    });
                    console.log(`   ✅ Created rule #${rule.step}: ${rule.delay}h`);
                }
            }
        }

        console.log('\n🎉 Done! Follow-up rules seeded successfully.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

seedFollowupRules();
