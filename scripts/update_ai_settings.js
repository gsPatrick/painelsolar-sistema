const { SystemSettings } = require('./src/models');
const openAIService = require('./src/services/OpenAIService');

async function updateSettings() {
    try {
        console.log('--- UPDATING AI SETTINGS ---');

        // New prompt is already in the service instance (we just updated the file)
        const newPrompt = openAIService.systemPrompt;

        // Update or Create the setting
        await SystemSettings.upsert({
            key: 'openai_system_prompt',
            value: newPrompt
        });

        console.log('✅ System Prompt updated in Database successfully!');
        console.log('Preview:', newPrompt.substring(0, 100) + '...');

    } catch (error) {
        console.error('Error updating settings:', error);
    } finally {
        // We can't easily close the connection if models handle it internally, 
        // but typically the script will exit.
        // If models.js creates a persistent connection, we might need to close it.
        // Assuming process.exit is fine for a script.
        process.exit(0);
    }
}

updateSettings();
