const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Appointment = sequelize.define('Appointment', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    lead_id: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    date_time: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    type: {
        type: DataTypes.ENUM('VISITA_TECNICA', 'INSTALACAO', 'LEMBRETE'),
        allowNull: false,
    },
    status: {
        type: DataTypes.ENUM('scheduled', 'completed', 'cancelled'),
        defaultValue: 'scheduled',
        allowNull: false,
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    // Reminder tracking fields
    reminded_1day: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false,
    },
    reminded_2hours: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false,
    },
}, {
    tableName: 'appointments',
});

module.exports = Appointment;
