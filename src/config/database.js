const { Sequelize } = require('sequelize');
const env = require('./env');

const sequelize = new Sequelize(env.DB_NAME, env.DB_USER, env.DB_PASSWORD, {
    host: env.DB_HOST,
    port: env.DB_PORT,
    dialect: 'postgres',
    logging: env.NODE_ENV === 'development' ? console.log : false,
    pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000,
    },
    define: {
        timestamps: true,
        underscored: true,
    },
});

module.exports = sequelize;
