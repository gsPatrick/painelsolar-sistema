const { sequelize } = require('./src/models');

async function syncDatabase() {
    try {
        console.log('🔄 Syncing database...');

        await sequelize.authenticate();
        console.log('✅ Database connected');

        // Force sync will drop and recreate tables
        // Use { alter: true } for non-destructive sync
        await sequelize.sync({ force: false, alter: true });

        console.log('✅ Database synchronized successfully');
        process.exit(0);
    } catch (error) {
        console.error('❌ Database sync failed:', error.message);
        process.exit(1);
    }
}

syncDatabase();
