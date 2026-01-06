const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Task = sequelize.define('Task', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    lead_id: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    title: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    due_date: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    status: {
        type: DataTypes.ENUM('pending', 'done'),
        defaultValue: 'pending',
        allowNull: false,
    },
    type: {
        type: DataTypes.ENUM('FOLLOW_UP', 'PROPOSAL', 'OTHER'),
        defaultValue: 'OTHER',
        allowNull: false,
    },
}, {
    tableName: 'tasks',
});

module.exports = Task;
