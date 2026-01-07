const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Lead = sequelize.define('Lead', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    name: {
        type: DataTypes.STRING(150),
        allowNull: false,
    },
    phone: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    source: {
        type: DataTypes.ENUM('manual', 'meta_ads', 'whatsapp'),
        defaultValue: 'manual',
        allowNull: false,
    },
    status: {
        type: DataTypes.ENUM('active', 'deleted', 'blocked'),
        defaultValue: 'active',
        allowNull: false,
    },
    meta_campaign_data: {
        type: DataTypes.JSONB,
        defaultValue: {},
    },
    is_important: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    pipeline_id: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    order_index: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
    proposal_value: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0,
    },
    system_size_kwp: {
        type: DataTypes.FLOAT,
        defaultValue: 0,
    },
    last_interaction_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
    },
    human_takeover: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    deleted_at: {
        type: DataTypes.DATE,
        allowNull: true,
    },
}, {
    tableName: 'leads',
});

module.exports = Lead;

