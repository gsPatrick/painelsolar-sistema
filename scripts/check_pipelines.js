
const { Pipeline } = require('../src/models');
require('dotenv').config({ path: '../.env' });

async function checkPipelines() {
    try {
        const pipelines = await Pipeline.findAll({ order: [['order_index', 'ASC']] });
        console.log('Current Pipelines:');
        pipelines.forEach(p => console.log(`${p.order_index}: ${p.title} (ID: ${p.id})`));
    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit();
    }
}

checkPipelines();
