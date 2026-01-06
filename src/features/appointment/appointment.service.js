const { Appointment, Lead } = require('../../models');
const { Op } = require('sequelize');

class AppointmentService {
    /**
     * Get all appointments
     */
    async getAll(filters = {}) {
        const where = {};

        if (filters.lead_id) {
            where.lead_id = filters.lead_id;
        }
        if (filters.type) {
            where.type = filters.type;
        }
        if (filters.status) {
            where.status = filters.status;
        }
        if (filters.date) {
            const startOfDay = new Date(filters.date);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(filters.date);
            endOfDay.setHours(23, 59, 59, 999);

            where.date_time = {
                [Op.between]: [startOfDay, endOfDay],
            };
        }

        return Appointment.findAll({
            where,
            include: [{ model: Lead, as: 'lead' }],
            order: [['date_time', 'ASC']],
        });
    }

    /**
     * Get appointment by ID
     */
    async getById(id) {
        const appointment = await Appointment.findByPk(id, {
            include: [{ model: Lead, as: 'lead' }],
        });

        if (!appointment) {
            throw new Error('Agendamento não encontrado');
        }

        return appointment;
    }

    /**
     * Create a new appointment with blocking validation
     */
    async create(data) {
        const { lead_id, date_time, type, notes } = data;

        // Verify lead exists
        const lead = await Lead.findByPk(lead_id);
        if (!lead) {
            throw new Error('Lead não encontrado');
        }

        // Check for blocking: VISITA_TECNICA blocked if INSTALACAO exists same day
        if (type === 'VISITA_TECNICA') {
            const hasConflict = await this.checkInstallationConflict(date_time);
            if (hasConflict) {
                throw new Error('Não é possível agendar visita técnica neste horário. Existe uma instalação agendada.');
            }
        }

        return Appointment.create({
            lead_id,
            date_time,
            type,
            status: 'scheduled',
            notes,
        });
    }

    /**
     * Check if there's an INSTALACAO on the same day/time
     */
    async checkInstallationConflict(dateTime) {
        const appointmentDate = new Date(dateTime);
        const startOfDay = new Date(appointmentDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(appointmentDate);
        endOfDay.setHours(23, 59, 59, 999);

        const existingInstallation = await Appointment.findOne({
            where: {
                type: 'INSTALACAO',
                status: 'scheduled',
                date_time: {
                    [Op.between]: [startOfDay, endOfDay],
                },
            },
        });

        return !!existingInstallation;
    }

    /**
     * Update an appointment
     */
    async update(id, data) {
        const appointment = await Appointment.findByPk(id);
        if (!appointment) {
            throw new Error('Agendamento não encontrado');
        }

        const { date_time, type, status, notes } = data;

        // If changing to VISITA_TECNICA, check for conflicts
        if (type === 'VISITA_TECNICA' && date_time) {
            const hasConflict = await this.checkInstallationConflict(date_time);
            if (hasConflict) {
                throw new Error('Não é possível agendar visita técnica neste horário. Existe uma instalação agendada.');
            }
        }

        if (date_time !== undefined) appointment.date_time = date_time;
        if (type !== undefined) appointment.type = type;
        if (status !== undefined) appointment.status = status;
        if (notes !== undefined) appointment.notes = notes;

        await appointment.save();
        return appointment;
    }

    /**
     * Cancel an appointment
     */
    async cancel(id) {
        return this.update(id, { status: 'cancelled' });
    }

    /**
     * Complete an appointment
     */
    async complete(id) {
        return this.update(id, { status: 'completed' });
    }

    /**
     * Delete an appointment
     */
    async delete(id) {
        const appointment = await Appointment.findByPk(id);
        if (!appointment) {
            throw new Error('Agendamento não encontrado');
        }

        await appointment.destroy();
        return { message: 'Agendamento excluído com sucesso' };
    }

    /**
     * Get today's appointments
     */
    async getTodayAppointments() {
        const today = new Date();
        return this.getAll({ date: today.toISOString().split('T')[0] });
    }

    /**
     * Get upcoming appointments
     */
    async getUpcoming(days = 7) {
        const now = new Date();
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + days);

        return Appointment.findAll({
            where: {
                date_time: {
                    [Op.between]: [now, futureDate],
                },
                status: 'scheduled',
            },
            include: [{ model: Lead, as: 'lead' }],
            order: [['date_time', 'ASC']],
        });
    }
}

module.exports = new AppointmentService();
