
const { User } = require('./src/models');

async function listUsers() {
    try {
        const users = await User.findAll();
        console.log('--- USERS ---');
        users.forEach(u => {
            console.log(`ID: ${u.id} | Name: ${u.name} | Email: ${u.email} | Role: ${u.role}`);
        });
    } catch (error) {
        console.error('Error listing users:', error);
    }
}

listUsers();
