const { Task, Appointment } = require('../models');
const sequelize = require('../config/database');

async function migrate() {
    console.log('Starting migration from Tasks to Appointments (Reminders)...');

    try {
        // Find all tasks
        const tasks = await Task.findAll();
        console.log(`Found ${tasks.length} tasks to migrate.`);

        let count = 0;
        for (const task of tasks) {
            // Check if already migrated (optional duplicate check strategies: title + date + lead)
            // For now, simple migration.

            const newStatus = task.status === 'done' ? 'completed' : 'scheduled';

            await Appointment.create({
                lead_id: task.lead_id,
                title: task.title,
                description: task.description,
                date_time: task.due_date,
                type: 'LEMBRETE',
                status: newStatus,
                reminded_1day: true, // Assume old tasks don't need reminders if past, or just true to be safe
                reminded_2hours: true
            });
            count++;
        }

        console.log(`Successfully migrated ${count} tasks.`);
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        // process.exit();
    }
}

// Run if main
migrate();
