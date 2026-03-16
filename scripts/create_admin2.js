/**
 * Script to create admin2 user
 * Run: node scripts/create_admin2.js
 */
require('../src/config/database');
const bcrypt = require('bcryptjs');
const { User } = require('../src/models');

async function createAdmin2() {
    try {
        const email = 'admin2@socio.com';
        const password = 'adminsocio';
        const name = 'Admin Sócio';

        // Check if already exists
        const existing = await User.findOne({ where: { email } });
        if (existing) {
            console.log(`❌ Usuário ${email} já existe.`);
            process.exit(0);
        }

        // Hash password
        const password_hash = await bcrypt.hash(password, 10);

        // Create user
        const user = await User.create({
            name,
            email,
            password_hash,
            role: 'admin'
        });

        console.log(`✅ Admin criado com sucesso!`);
        console.log(`   Email: ${email}`);
        console.log(`   Senha: ${password}`);
        console.log(`   ID: ${user.id}`);

        process.exit(0);
    } catch (error) {
        console.error('❌ Erro ao criar admin:', error.message);
        process.exit(1);
    }
}

createAdmin2();
