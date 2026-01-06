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
        type: DataTypes.ENUM('VISITA_TECNICA', 'INSTALACAO'),
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
}, {
    tableName: 'appointments',
});

module.exports = Appointment;
