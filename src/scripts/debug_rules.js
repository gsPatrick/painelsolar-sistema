const { Lead, Pipeline, FollowUpRule } = require('../models');
const { Op } = require('sequelize');

async function debugRules() {
    try {
        console.log('--- Debugging Rules ---');

        const pipelines = await Pipeline.findAll({
            where: {
                title: { [Op.like]: '%Proposta%' }
            }
        });

        for (const p of pipelines) {
            console.log(`Pipeline: ${p.title} (ID: ${p.id})`);
            const rules = await FollowUpRule.findAll({
                where: { pipeline_id: p.id }
            });

            if (rules.length === 0) {
                console.log('  NO RULES FOUND.');
            } else {
                rules.forEach(r => {
                    console.log(`  - Rule ID: ${r.id}, Step: ${r.step_number}, Delay: ${r.delay_hours}h, Active: ${r.active}`);
                });
            }
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

debugRules();
