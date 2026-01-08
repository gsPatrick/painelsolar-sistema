const { Pipeline, Lead } = require('../../models');
const { Op } = require('sequelize');

class PipelineService {
    /**
     * Get all pipelines ordered by order_index
     */
    async getAll() {
        return Pipeline.findAll({
            order: [['order_index', 'ASC']],
        });
    }

    /**
     * Get pipeline by ID with leads
     */
    async getById(id) {
        const pipeline = await Pipeline.findByPk(id, {
            include: [{
                model: Lead,
                as: 'leads',
                order: [['order_index', 'ASC']],
                include: [{ // Nested include for appointments
                    model: require('../../models').Appointment,
                    as: 'appointments',
                    required: false, // Left join
                }]
            }],
        });

        if (!pipeline) {
            throw new Error('Pipeline não encontrado');
        }

        return pipeline;
    }

    /**
     * Create a new pipeline
     */
    async create(data) {
        const { title, color, sla_limit_days } = data;

        // Get the highest order_index and add 1
        const lastPipeline = await Pipeline.findOne({
            order: [['order_index', 'DESC']],
        });
        const order_index = lastPipeline ? lastPipeline.order_index + 1 : 0;

        return Pipeline.create({
            title,
            color: color || '#3B82F6',
            order_index,
            sla_limit_days: sla_limit_days || 3,
        });
    }

    /**
     * Update a pipeline
     */
    async update(id, data) {
        const pipeline = await Pipeline.findByPk(id);
        if (!pipeline) {
            throw new Error('Pipeline não encontrado');
        }

        const { title, color, sla_limit_days } = data;
        if (title !== undefined) pipeline.title = title;
        if (color !== undefined) pipeline.color = color;
        if (sla_limit_days !== undefined) pipeline.sla_limit_days = sla_limit_days;

        await pipeline.save();
        return pipeline;
    }

    /**
     * Delete a pipeline
     */
    async delete(id) {
        const pipeline = await Pipeline.findByPk(id);
        if (!pipeline) {
            throw new Error('Pipeline não encontrado');
        }

        // Prevent deletion of protected pipelines (like "Primeiro Contato")
        if (pipeline.is_protected) {
            throw new Error('Este pipeline não pode ser excluído pois é protegido pelo sistema');
        }

        // Move leads to null before deleting
        await Lead.update({ pipeline_id: null }, { where: { pipeline_id: id } });
        await pipeline.destroy();

        return { message: 'Pipeline excluído com sucesso' };
    }

    /**
     * Reorder pipelines
     * @param {Array} orderedIds - Array of pipeline IDs in the desired order
     */
    async reorder(orderedIds) {
        for (let i = 0; i < orderedIds.length; i++) {
            await Pipeline.update(
                { order_index: i },
                { where: { id: orderedIds[i] } }
            );
        }

        return this.getAll();
    }

    /**
     * Get first pipeline (for new leads)
     */
    async getFirstPipeline() {
        return Pipeline.findOne({
            order: [['order_index', 'ASC']],
        });
    }

    /**
     * Get pipeline with leads and SLA status calculated
     */
    async getPipelinesWithLeads() {
        const pipelines = await Pipeline.findAll({
            order: [['order_index', 'ASC']],
            include: [{
                model: Lead,
                as: 'leads',
                order: [['order_index', 'ASC']],
            }],
        });

        // Calculate SLA status for each lead
        return pipelines.map(pipeline => {
            const pipelineData = pipeline.toJSON();
            pipelineData.leads = pipelineData.leads.map(lead => ({
                ...lead,
                sla_status: this.calculateSlaStatus(lead.last_interaction_at, pipeline.sla_limit_days),
            }));
            return pipelineData;
        });
    }

    /**
     * Calculate SLA status (GREEN, YELLOW, RED)
     */
    calculateSlaStatus(lastInteractionAt, slaLimitDays) {
        if (!lastInteractionAt) return 'RED';

        const now = new Date();
        const lastInteraction = new Date(lastInteractionAt);
        const diffTime = now - lastInteraction;
        const diffDays = diffTime / (1000 * 60 * 60 * 24);

        if (diffDays < slaLimitDays * 0.5) {
            return 'GREEN';
        } else if (diffDays < slaLimitDays) {
            return 'YELLOW';
        } else {
            return 'RED';
        }
    }
}

module.exports = new PipelineService();
