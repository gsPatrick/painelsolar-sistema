/**
 * Test Reminders Logic
 * 
 * This script allows triggering the reminder logic for a specific lead/appointment
 * to verify that external messages go ONLY to the correct types, while internal
 * alerts go to ALL admins.
 */

const { Appointment, Lead, AdminNumber, SystemSettings } = require('../src/models');
const whatsAppService = require('../src/services/WhatsAppService');
const cronService = require('../src/services/CronService');

async function runTest() {
    console.log('🚀 Starting Reminders Test...');

    try {
        // 1. Verify Admins
        const admins = await AdminNumber.findAll({ where: { active: true } });
        console.log(`\n📋 Found ${admins.length} active admins:`);
        admins.forEach(a => console.log(` - ${a.name} (${a.phone})`));

        // 2. Prepare mock conditions (ensure reminders are enabled)
        await SystemSettings.update({ value: 'true' }, { where: { key: 'reminder_enabled' } });
        await SystemSettings.update({ value: 'true' }, { where: { key: 'reminder_1day_enabled' } });
        console.log('✅ Reminders enabled in settings');

        // 3. Find/Create a test Lead
        let lead = await Lead.findOne({ where: { phone: '5511999999999' } });
        if (!lead) {
            lead = await Lead.create({
                name: 'Lead Teste Remoto',
                phone: '5511999999999',
                source: 'manual',
                ai_status: 'active'
            });
            console.log('✅ Test Lead created');
        }

        // 4. Test CASE A: LEMBRETE (Internal Only)
        console.log('\n--- 🧪 TESTING CASE: LEMBRETE (Should NOT send to client) ---');
        const tomorrow = new Date();
        tomorrow.setHours(tomorrow.getHours() + 24);

        const lembrete = await Appointment.create({
            lead_id: lead.id,
            type: 'LEMBRETE',
            status: 'scheduled',
            date_time: tomorrow,
            notes: 'Este é um lembrete INTERNO de teste.',
            reminded_1day: false,
            reminded_2hours: false
        });

        console.log(`Appointment created: ID ${lembrete.id}, Type: ${lembrete.type}`);
        
        // Trigger check
        console.log('Running checkAppointmentReminders()...');
        await cronService.checkAppointmentReminders();

        // 5. Cleanup
        await lembrete.destroy();
        console.log('\n--- Test Finished ---');
        console.log('Check console logs above to see if messages were sent to CUSTOMER or broadcast to ADMINS.');

    } catch (err) {
        console.error('❌ Test failed:', err);
    } finally {
        process.exit(0);
    }
}

runTest();
