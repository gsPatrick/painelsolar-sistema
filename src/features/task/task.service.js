const { Task, Lead } = require('../../models');
const { Op } = require('sequelize');

class TaskService {
    /**
     * Get all tasks
     */
    async getAll(filters = {}) {
        const where = {};

        if (filters.lead_id) {
            where.lead_id = filters.lead_id;
        }
        if (filters.status) {
            where.status = filters.status;
        }
        if (filters.type) {
            where.type = filters.type;
        }

        return Task.findAll({
            where,
            include: [{ model: Lead, as: 'lead' }],
            order: [['due_date', 'ASC']],
        });
    }

    /**
     * Get task by ID
     */
    async getById(id) {
        const task = await Task.findByPk(id, {
            include: [{ model: Lead, as: 'lead' }],
        });

        if (!task) {
            throw new Error('Tarefa não encontrada');
        }

        return task;
    }

    /**
     * Create a new task
     */
    async create(data) {
        const { lead_id, title, due_date, type } = data;

        // Verify lead exists
        const lead = await Lead.findByPk(lead_id);
        if (!lead) {
            throw new Error('Lead não encontrado');
        }

        return Task.create({
            lead_id,
            title,
            due_date,
            status: 'pending',
            type: type || 'OTHER',
        });
    }

    /**
     * Update a task
     */
    async update(id, data) {
        const task = await Task.findByPk(id);
        if (!task) {
            throw new Error('Tarefa não encontrada');
        }

        const { title, due_date, status, type } = data;
        if (title !== undefined) task.title = title;
        if (due_date !== undefined) task.due_date = due_date;
        if (status !== undefined) task.status = status;
        if (type !== undefined) task.type = type;

        await task.save();
        return task;
    }

    /**
     * Mark task as done
     */
    async markAsDone(id) {
        return this.update(id, { status: 'done' });
    }

    /**
     * Delete a task
     */
    async delete(id) {
        const task = await Task.findByPk(id);
        if (!task) {
            throw new Error('Tarefa não encontrada');
        }

        await task.destroy();
        return { message: 'Tarefa excluída com sucesso' };
    }

    /**
     * Get overdue tasks
     */
    async getOverdueTasks() {
        return Task.findAll({
            where: {
                status: 'pending',
                due_date: {
                    [Op.lt]: new Date(),
                },
            },
            include: [{ model: Lead, as: 'lead' }],
            order: [['due_date', 'ASC']],
        });
    }

    /**
     * Get today's tasks
     */
    async getTodayTasks() {
        const today = new Date();
        const startOfDay = new Date(today.setHours(0, 0, 0, 0));
        const endOfDay = new Date(today.setHours(23, 59, 59, 999));

        return Task.findAll({
            where: {
                due_date: {
                    [Op.between]: [startOfDay, endOfDay],
                },
            },
            include: [{ model: Lead, as: 'lead' }],
            order: [['due_date', 'ASC']],
        });
    }
}

module.exports = new TaskService();
