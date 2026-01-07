const appointmentService = require('./appointment.service');

class AppointmentController {
    /**
     * GET /appointments
     */
    async getAll(req, res) {
        try {
            const filters = {
                lead_id: req.query.lead_id,
                type: req.query.type,
                status: req.query.status,
                date: req.query.date,
            };

            const appointments = await appointmentService.getAll(filters);
            res.status(200).json(appointments);
        } catch (error) {
            console.error('[AppointmentController] GetAll error:', error.message);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * GET /appointments/today
     */
    async getToday(req, res) {
        try {
            const appointments = await appointmentService.getTodayAppointments();
            res.status(200).json(appointments);
        } catch (error) {
            console.error('[AppointmentController] GetToday error:', error.message);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * GET /appointments/upcoming
     */
    async getUpcoming(req, res) {
        try {
            const days = parseInt(req.query.days) || 7;
            const appointments = await appointmentService.getUpcoming(days);
            res.status(200).json(appointments);
        } catch (error) {
            console.error('[AppointmentController] GetUpcoming error:', error.message);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * GET /appointments/:id
     */
    async getById(req, res) {
        try {
            const appointment = await appointmentService.getById(req.params.id);
            res.status(200).json(appointment);
        } catch (error) {
            console.error('[AppointmentController] GetById error:', error.message);
            res.status(404).json({ error: error.message });
        }
    }

    /**
     * POST /appointments
     */
    async create(req, res) {
        try {
            const { lead_id, date_time, type, notes } = req.body;

            if (!lead_id || !date_time || !type) {
                return res.status(400).json({ error: 'lead_id, date_time e type são obrigatórios' });
            }

            const appointment = await appointmentService.create({ lead_id, date_time, type, notes });
            res.status(201).json(appointment);
        } catch (error) {
            console.error('[AppointmentController] Create error:', error.message);
            // Return 409 Conflict if it's a schedule conflict
            const statusCode = error.statusCode || 400;
            res.status(statusCode).json({ error: error.message });
        }
    }

    /**
     * PUT /appointments/:id
     */
    async update(req, res) {
        try {
            const appointment = await appointmentService.update(req.params.id, req.body);
            res.status(200).json(appointment);
        } catch (error) {
            console.error('[AppointmentController] Update error:', error.message);
            res.status(400).json({ error: error.message });
        }
    }

    /**
     * PUT /appointments/:id/cancel
     */
    async cancel(req, res) {
        try {
            const appointment = await appointmentService.cancel(req.params.id);
            res.status(200).json(appointment);
        } catch (error) {
            console.error('[AppointmentController] Cancel error:', error.message);
            res.status(400).json({ error: error.message });
        }
    }

    /**
     * PUT /appointments/:id/complete
     */
    async complete(req, res) {
        try {
            const appointment = await appointmentService.complete(req.params.id);
            res.status(200).json(appointment);
        } catch (error) {
            console.error('[AppointmentController] Complete error:', error.message);
            res.status(400).json({ error: error.message });
        }
    }

    /**
     * DELETE /appointments/:id
     */
    async delete(req, res) {
        try {
            const result = await appointmentService.delete(req.params.id);
            res.status(200).json(result);
        } catch (error) {
            console.error('[AppointmentController] Delete error:', error.message);
            res.status(400).json({ error: error.message });
        }
    }
}

module.exports = new AppointmentController();
