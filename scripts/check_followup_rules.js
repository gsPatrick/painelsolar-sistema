
const { FollowUpRule, Pipeline } = require('../src/models');
const sequelize = require('../src/config/database');

async function checkRules() {
    try {
        await sequelize.authenticate();
        console.log('Database connected.');

        const rules = await FollowUpRule.findAll({
            include: [{ model: Pipeline, as: 'pipeline' }],
            order: [['pipeline_id', 'ASC'], ['step_number', 'ASC']]
        });

        console.log('\n--- Active FollowUp Rules ---');
        rules.forEach(r => {
            console.log(`Pipeline: ${r.pipeline ? r.pipeline.title : 'Unknown'} | Step: ${r.step_number}`);
            console.log(`   Delay: ${r.delay_hours} hours (${r.delay_hours * 60} mins)`);
            console.log(`   Template: "${r.message_template.substring(0, 50)}..."`);
            console.log('-----------------------------------');
        });

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sequelize.close();
    }
}

checkRules();
