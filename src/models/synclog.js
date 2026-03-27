const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SyncLog = sequelize.define('SyncLog', {
    service: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'meta_sync'
    },
    status: {
        type: DataTypes.ENUM('success', 'error', 'running'),
        allowNull: false
    },
    message: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    leads_found: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    leads_added: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    error_details: {
        type: DataTypes.JSON,
        allowNull: true
    },
    startedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    finishedAt: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    tableName: 'sync_logs',
    underscored: true,
});

module.exports = SyncLog;
