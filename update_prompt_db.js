const { SystemSettings } = require('./src/models');
const { DEFAULT_SETTINGS } = require('./src/models/SystemSettings');

async function updatePrompt() {
    try {
        console.log('Updating system prompt in database...');

        const promptSetting = DEFAULT_SETTINGS.find(s => s.key === 'openai_system_prompt');

        if (promptSetting) {
            await SystemSettings.update(
                { value: promptSetting.value },
                { where: { key: 'openai_system_prompt' } }
            );
            console.log('Successfully updated prompt to "Consultora".');
        } else {
            console.error('Could not find default prompt setting.');
        }

    } catch (error) {
        console.error('Error updating prompt:', error);
    } finally {
        process.exit();
    }
}

updatePrompt();
