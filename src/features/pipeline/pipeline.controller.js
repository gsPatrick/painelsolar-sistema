const pipelineService = require('./pipeline.service');

class PipelineController {
    /**
     * GET /pipelines
     */
    async getAll(req, res) {
        try {
            const pipelines = await pipelineService.getAll();
            res.status(200).json(pipelines);
        } catch (error) {
            console.error('[PipelineController] GetAll error:', error.message);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * GET /pipelines/kanban - Get with leads and SLA status
     */
    async getKanban(req, res) {
        try {
            const pipelines = await pipelineService.getPipelinesWithLeads();
            res.status(200).json(pipelines);
        } catch (error) {
            console.error('[PipelineController] GetKanban error:', error.message);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * GET /pipelines/:id
     */
    async getById(req, res) {
        try {
            const pipeline = await pipelineService.getById(req.params.id);
            res.status(200).json(pipeline);
        } catch (error) {
            console.error('[PipelineController] GetById error:', error.message);
            res.status(404).json({ error: error.message });
        }
    }

    /**
     * POST /pipelines
     */
    async create(req, res) {
        try {
            const { title, color, sla_limit_days } = req.body;

            if (!title) {
                return res.status(400).json({ error: 'Título é obrigatório' });
            }

            const pipeline = await pipelineService.create({ title, color, sla_limit_days });
            res.status(201).json(pipeline);
        } catch (error) {
            console.error('[PipelineController] Create error:', error.message);
            res.status(400).json({ error: error.message });
        }
    }

    /**
     * PUT /pipelines/:id
     */
    async update(req, res) {
        try {
            const pipeline = await pipelineService.update(req.params.id, req.body);
            res.status(200).json(pipeline);
        } catch (error) {
            console.error('[PipelineController] Update error:', error.message);
            res.status(400).json({ error: error.message });
        }
    }

    /**
     * DELETE /pipelines/:id
     */
    async delete(req, res) {
        try {
            const result = await pipelineService.delete(req.params.id);
            res.status(200).json(result);
        } catch (error) {
            console.error('[PipelineController] Delete error:', error.message);
            res.status(400).json({ error: error.message });
        }
    }

    /**
     * POST /pipelines/reorder
     */
    async reorder(req, res) {
        try {
            const { orderedIds } = req.body;

            if (!orderedIds || !Array.isArray(orderedIds)) {
                return res.status(400).json({ error: 'orderedIds deve ser um array' });
            }

            const pipelines = await pipelineService.reorder(orderedIds);
            res.status(200).json(pipelines);
        } catch (error) {
            console.error('[PipelineController] Reorder error:', error.message);
            res.status(400).json({ error: error.message });
        }
    }
}

module.exports = new PipelineController();
