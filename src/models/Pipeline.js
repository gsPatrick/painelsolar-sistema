const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Pipeline = sequelize.define('Pipeline', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    title: {
        type: DataTypes.STRING(100),
        allowNull: false,
    },
    color: {
        type: DataTypes.STRING(7), // Hex color: #FFFFFF
        defaultValue: '#3B82F6',
        allowNull: false,
    },
    order_index: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    sla_limit_days: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 3, // Default: 3 days max without interaction
    },
}, {
    tableName: 'pipelines',
});

module.exports = Pipeline;
