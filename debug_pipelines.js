
const { Pipeline } = require('./src/models');

async function debugPipelines() {
    try {
        const pipelines = await Pipeline.findAll({ order: [['order_index', 'ASC']] });
        console.log('--- Current Pipelines ---');
        pipelines.forEach(p => {
            console.log(`ID: ${p.id} | Title: ${p.title} | Order: ${p.order_index}`);
        });
        console.log('-------------------------');
        process.exit(0);
    } catch (error) {
        console.error('Error debugging pipelines:', error);
        process.exit(1);
    }
}

debugPipelines();
