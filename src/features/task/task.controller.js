const taskService = require('./task.service');

class TaskController {
    /**
     * GET /tasks
     */
    async getAll(req, res) {
        try {
            const filters = {
                lead_id: req.query.lead_id,
                status: req.query.status,
                type: req.query.type,
            };

            const tasks = await taskService.getAll(filters);
            res.status(200).json(tasks);
        } catch (error) {
            console.error('[TaskController] GetAll error:', error.message);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * GET /tasks/today
     */
    async getToday(req, res) {
        try {
            const tasks = await taskService.getTodayTasks();
            res.status(200).json(tasks);
        } catch (error) {
            console.error('[TaskController] GetToday error:', error.message);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * GET /tasks/overdue
     */
    async getOverdue(req, res) {
        try {
            const tasks = await taskService.getOverdueTasks();
            res.status(200).json(tasks);
        } catch (error) {
            console.error('[TaskController] GetOverdue error:', error.message);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * GET /tasks/:id
     */
    async getById(req, res) {
        try {
            const task = await taskService.getById(req.params.id);
            res.status(200).json(task);
        } catch (error) {
            console.error('[TaskController] GetById error:', error.message);
            res.status(404).json({ error: error.message });
        }
    }

    /**
     * POST /tasks
     */
    async create(req, res) {
        try {
            const { lead_id, title, due_date, type } = req.body;

            if (!lead_id || !title || !due_date) {
                return res.status(400).json({ error: 'lead_id, title e due_date são obrigatórios' });
            }

            const task = await taskService.create({ lead_id, title, due_date, type });
            res.status(201).json(task);
        } catch (error) {
            console.error('[TaskController] Create error:', error.message);
            res.status(400).json({ error: error.message });
        }
    }

    /**
     * PUT /tasks/:id
     */
    async update(req, res) {
        try {
            const task = await taskService.update(req.params.id, req.body);
            res.status(200).json(task);
        } catch (error) {
            console.error('[TaskController] Update error:', error.message);
            res.status(400).json({ error: error.message });
        }
    }

    /**
     * PUT /tasks/:id/done
     */
    async markAsDone(req, res) {
        try {
            const task = await taskService.markAsDone(req.params.id);
            res.status(200).json(task);
        } catch (error) {
            console.error('[TaskController] MarkAsDone error:', error.message);
            res.status(400).json({ error: error.message });
        }
    }

    /**
     * DELETE /tasks/:id
     */
    async delete(req, res) {
        try {
            const result = await taskService.delete(req.params.id);
            res.status(200).json(result);
        } catch (error) {
            console.error('[TaskController] Delete error:', error.message);
            res.status(400).json({ error: error.message });
        }
    }
}

module.exports = new TaskController();
