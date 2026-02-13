
const { FollowUpRule, Pipeline } = require('../src/models');
require('../src/config/database');

async function listRules() {
    try {
        const rules = await FollowUpRule.findAll({
            include: [{ model: Pipeline, as: 'pipeline' }],
            order: [['pipeline_id', 'ASC'], ['step_number', 'ASC']]
        });

        console.log(`Found ${rules.length} rules.`);
        rules.forEach(r => {
            console.log(`\nRule ID: ${r.id}`);
            console.log(`Pipeline: ${r.pipeline?.title} (${r.pipeline_id})`);
            console.log(`Step: ${r.step_number}`);
            console.log(`Delay: ${r.delay_hours}h`);
            console.log(`Template: "${r.message_template}"`);
        });
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

listRules();
