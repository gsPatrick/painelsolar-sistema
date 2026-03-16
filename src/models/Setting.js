const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Setting = sequelize.define('Setting', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    key: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
    },
    value: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
    },
    description: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },
}, {
    tableName: 'settings',
});

module.exports = Setting;
