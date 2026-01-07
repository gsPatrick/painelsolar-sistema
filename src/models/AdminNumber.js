const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AdminNumber = sequelize.define('AdminNumber', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    name: {
        type: DataTypes.STRING(100),
        allowNull: false,
    },
    phone: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
    },
}, {
    tableName: 'admin_numbers',
});

module.exports = AdminNumber;
