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
    whatsapp_lid: {
        type: DataTypes.STRING(50),
        allowNull: true,
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
    meta_leadgen_id: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: 'Facebook leadgen ID for deduplication',
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
    ai_status: {
        type: DataTypes.ENUM('active', 'paused', 'human_intervention'),
        defaultValue: 'active',
        allowNull: false,
    },
    ai_paused_at: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    custom_followup_message: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Custom follow-up message for this lead (overrides global default)',
    },
    last_followup_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'When the last follow-up was sent to this lead',
    },
    followup_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: 'Number of follow-ups sent to this lead',
    },
    deleted_at: {
        type: DataTypes.DATE,
        allowNull: true,
    },
}, {
    tableName: 'leads',
});

module.exports = Lead;

