const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

async function migrate() {
    try {
        await sequelize.authenticate();
        console.log('Connection has been established successfully.');

        // Alter the table
        await sequelize.query('ALTER TABLE "followup_rules" ALTER COLUMN "delay_hours" TYPE DOUBLE PRECISION;');
        console.log('✅ Column delay_hours changed to DOUBLE PRECISION successfully.');

    } catch (error) {
        console.error('Unable to connect to the database:', error);
        console.error(error);
    } finally {
        await sequelize.close();
    }
}

migrate();
