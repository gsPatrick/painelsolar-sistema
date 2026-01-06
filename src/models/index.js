const sequelize = require('../config/database');

// Import models
const User = require('./User');
const Pipeline = require('./Pipeline');
const Lead = require('./Lead');
const Task = require('./Task');
const Appointment = require('./Appointment');
const Message = require('./Message');

// Define associations

// Pipeline has many Leads
Pipeline.hasMany(Lead, {
    foreignKey: 'pipeline_id',
    as: 'leads',
});
Lead.belongsTo(Pipeline, {
    foreignKey: 'pipeline_id',
    as: 'pipeline',
});

// Lead has many Tasks
Lead.hasMany(Task, {
    foreignKey: 'lead_id',
    as: 'tasks',
});
Task.belongsTo(Lead, {
    foreignKey: 'lead_id',
    as: 'lead',
});

// Lead has many Appointments
Lead.hasMany(Appointment, {
    foreignKey: 'lead_id',
    as: 'appointments',
});
Appointment.belongsTo(Lead, {
    foreignKey: 'lead_id',
    as: 'lead',
});

// Lead has many Messages (AI conversation history)
Lead.hasMany(Message, {
    foreignKey: 'lead_id',
    as: 'messages',
});
Message.belongsTo(Lead, {
    foreignKey: 'lead_id',
    as: 'lead',
});

module.exports = {
    sequelize,
    User,
    Pipeline,
    Lead,
    Task,
    Appointment,
    Message,
};
