/**
 * Script to update admin2 user to viewer role
 * Run: node scripts/update_admin2_role.js
 */
require('../src/config/database');
const sequelize = require('../src/config/database');
const { User } = require('../src/models');

async function updateAdmin2() {
    try {
        // Fix for Postgres ENUM
        try {
            await sequelize.query(`ALTER TYPE "enum_users_role" ADD VALUE 'viewer';`);
            console.log("✅ ENUM updated.");
        } catch (e) {
            // Ignore if already exists or other error (prints to log just in case)
            console.log("ℹ️ ENUM update skipped (may already exist).");
        }

        const email = 'admin2@socio.com';

        const user = await User.findOne({ where: { email } });
        if (!user) {
            console.log(`❌ Usuário ${email} não encontrado.`);
            process.exit(1);
        }

        user.role = 'viewer';
        await user.save();

        console.log(`✅ Role de ${email} atualizada para: ${user.role}`);

        process.exit(0);
    } catch (error) {
        console.error('❌ Erro ao atualizar usuário:', error.message);
        process.exit(1);
    }
}

updateAdmin2();
