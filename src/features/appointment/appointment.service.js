const { Appointment, Lead, Pipeline } = require('../../models');
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

        // Check for double booking (Strict Same Time Rule)
        const isDoubleBooked = await this.checkDoubleBooking(date_time);
        if (isDoubleBooked) {
            const error = new Error('Horário Indisponível: Já existe um agendamento neste horário exato.');
            error.statusCode = 409;
            throw error;
        }

        // Check for conflict: VISITA_TECNICA blocked if INSTALACAO exists on same day
        if (type === 'VISITA_TECNICA') {
            const hasConflict = await this.checkConflict(date_time, 'INSTALACAO');
            if (hasConflict) {
                const error = new Error('Conflito de Agenda: Não é possível agendar Visita Técnica neste dia pois já existe uma Instalação confirmada.');
                error.statusCode = 409;
                throw error;
            }
        }

        // Check for conflict: INSTALACAO blocked if VISITA_TECNICA exists on same day
        if (type === 'INSTALACAO') {
            const hasConflict = await this.checkConflict(date_time, 'VISITA_TECNICA');
            if (hasConflict) {
                const error = new Error('Conflito de Agenda: Não é possível agendar Instalação neste dia pois já existe uma Visita Técnica confirmada.');
                error.statusCode = 409;
                throw error;
            }
        }

        const appointment = await Appointment.create({
            lead_id,
            date_time,
            type,
            status: 'scheduled',
            notes,
        });

        // AUTOMATION: Move lead to appropriate pipeline stage
        try {
            let targetStageTitle = null;

            if (type === 'VISITA_TECNICA') {
                targetStageTitle = 'Agendamento';
            } else if (type === 'INSTALACAO') {
                targetStageTitle = 'Fechamento';
            }

            if (targetStageTitle) {
                const targetPipeline = await Pipeline.findOne({ where: { title: targetStageTitle } });
                if (targetPipeline && lead.pipeline_id !== targetPipeline.id) {
                    lead.pipeline_id = targetPipeline.id;
                    await lead.save();
                    console.log(`[AppointmentService] Lead ${lead.id} moved to '${targetStageTitle}' pipeline`);
                }
            }
        } catch (error) {
            console.error('[AppointmentService] Error updating pipeline stage:', error.message);
            // Don't fail the request, just log error
        }

        return appointment;
    }

    /**
     * Check if there's a conflicting appointment on the same day
     * @param {Date} dateTime - The date/time to check
     * @param {string} conflictType - The type of appointment that would cause a conflict
     */
    async checkConflict(dateTime, conflictType) {
        const appointmentDate = new Date(dateTime);
        const startOfDay = new Date(appointmentDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(appointmentDate);
        endOfDay.setHours(23, 59, 59, 999);

        const existingAppointment = await Appointment.findOne({
            where: {
                type: conflictType,
                status: 'scheduled',
                date_time: {
                    [Op.between]: [startOfDay, endOfDay],
                },
            },
        });

        return !!existingAppointment;
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
     * Check if specific time slot is occupied (prevent double booking)
     * @param {Date} dateTime
     * @param {number} excludeId - ID to exclude (for updates)
     */
    async checkDoubleBooking(dateTime, excludeId = null) {
        const where = {
            date_time: dateTime,
            status: { [Op.ne]: 'cancelled' }
        };

        if (excludeId) {
            where.id = { [Op.ne]: excludeId };
        }

        const existing = await Appointment.findOne({ where });
        return !!existing;
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

        // If changing time, check for double booking
        if (date_time && new Date(date_time).getTime() !== new Date(appointment.date_time).getTime()) {
            const isDoubleBooked = await this.checkDoubleBooking(date_time, id);
            if (isDoubleBooked) {
                const error = new Error('Horário Indisponível: Já existe um agendamento neste horário exato.');
                error.statusCode = 409;
                throw error;
            }
        }

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

        // AUTOMATION: If marking INSTALACAO as completed, move to 'Pós-Venda'
        if (status === 'completed' && appointment.type === 'INSTALACAO') {
            try {
                const posVendaPipeline = await Pipeline.findOne({ where: { title: 'Pós-Venda' } });
                const lead = await Lead.findByPk(appointment.lead_id);

                if (posVendaPipeline && lead && lead.pipeline_id !== posVendaPipeline.id) {
                    lead.pipeline_id = posVendaPipeline.id;
                    await lead.save();
                    console.log(`[AppointmentService] Lead ${lead.id} moved to 'Pós-Venda' pipeline after installation completion`);
                }
            } catch (error) {
                console.error('[AppointmentService] Error updating pipeline stage (Pós-Venda):', error.message);
            }
        }

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
