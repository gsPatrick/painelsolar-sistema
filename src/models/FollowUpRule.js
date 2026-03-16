const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const FollowUpRule = sequelize.define('FollowUpRule', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    pipeline_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'pipelines', // Table name
            key: 'id',
        },
    },
    step_number: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1, // 1st message, 2nd message, etc.
    },
    delay_hours: {
        type: DataTypes.FLOAT, // Hours after previous interaction (or entry)
        allowNull: false,
        defaultValue: 24,
    },
    message_template: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: 'Olá {nome}, tudo bem?',
    },
    active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
    },
}, {
    tableName: 'followup_rules',
    timestamps: true,
});

module.exports = FollowUpRule;
