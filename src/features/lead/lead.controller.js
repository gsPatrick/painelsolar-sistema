const leadService = require('./lead.service');

class LeadController {
    /**
     * GET /leads
     */
    async getAll(req, res) {
        try {
            const filters = {
                pipeline_id: req.query.pipeline_id,
                is_important: req.query.is_important === 'true' ? true :
                    req.query.is_important === 'false' ? false : undefined,
                source: req.query.source,
            };

            const leads = await leadService.getAll(filters);
            res.status(200).json(leads);
        } catch (error) {
            console.error('[LeadController] GetAll error:', error.message);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * GET /leads/:id
     */
    async getById(req, res) {
        try {
            const lead = await leadService.getById(req.params.id);
            res.status(200).json(lead);
        } catch (error) {
            console.error('[LeadController] GetById error:', error.message);
            res.status(404).json({ error: error.message });
        }
    }

    /**
     * POST /leads
     */
    async create(req, res) {
        try {
            const { name, phone, source, meta_campaign_data, is_important, pipeline_id, proposal_value, system_size_kwp } = req.body;

            if (!name || !phone) {
                return res.status(400).json({ error: 'Nome e telefone são obrigatórios' });
            }

            const lead = await leadService.create({
                name, phone, source, meta_campaign_data, is_important, pipeline_id, proposal_value, system_size_kwp,
            });
            res.status(201).json(lead);
        } catch (error) {
            console.error('[LeadController] Create error:', error.message);
            res.status(400).json({ error: error.message });
        }
    }

    /**
     * PUT /leads/:id
     */
    async update(req, res) {
        try {
            const lead = await leadService.update(req.params.id, req.body);
            res.status(200).json(lead);
        } catch (error) {
            console.error('[LeadController] Update error:', error.message);
            res.status(400).json({ error: error.message });
        }
    }

    /**
     * PUT /leads/:id/move
     */
    async move(req, res) {
        try {
            const { pipeline_id, order_index } = req.body;

            if (!pipeline_id) {
                return res.status(400).json({ error: 'pipeline_id é obrigatório' });
            }

            const lead = await leadService.moveToPipeline(req.params.id, pipeline_id, order_index);
            res.status(200).json(lead);
        } catch (error) {
            console.error('[LeadController] Move error:', error.message);
            res.status(400).json({ error: error.message });
        }
    }

    /**
     * POST /leads/reorder
     */
    async reorder(req, res) {
        try {
            const { pipeline_id, ordered_lead_ids } = req.body;

            if (!pipeline_id || !ordered_lead_ids || !Array.isArray(ordered_lead_ids)) {
                return res.status(400).json({ error: 'pipeline_id e ordered_lead_ids são obrigatórios' });
            }

            const leads = await leadService.reorderLeads(pipeline_id, ordered_lead_ids);
            res.status(200).json(leads);
        } catch (error) {
            console.error('[LeadController] Reorder error:', error.message);
            res.status(400).json({ error: error.message });
        }
    }

    /**
     * DELETE /leads/:id - Soft delete
     */
    async delete(req, res) {
        try {
            const result = await leadService.delete(req.params.id);
            res.status(200).json(result);
        } catch (error) {
            console.error('[LeadController] Delete error:', error.message);
            res.status(400).json({ error: error.message });
        }
    }

    /**
     * PUT /leads/:id/block
     */
    async block(req, res) {
        try {
            const result = await leadService.block(req.params.id);
            res.status(200).json(result);
        } catch (error) {
            console.error('[LeadController] Block error:', error.message);
            res.status(400).json({ error: error.message });
        }
    }

    /**
     * PUT /leads/:id/restore
     */
    async restore(req, res) {
        try {
            const result = await leadService.restore(req.params.id);
            res.status(200).json(result);
        } catch (error) {
            console.error('[LeadController] Restore error:', error.message);
            res.status(400).json({ error: error.message });
        }
    }

    /**
     * GET /leads/sla-alerts
     */
    async getSlaAlerts(req, res) {
        try {
            const leads = await leadService.getSlaAlerts();
            res.status(200).json(leads);
        } catch (error) {
            console.error('[LeadController] GetSlaAlerts error:', error.message);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * GET /leads/overdue
     */
    async getOverdue(req, res) {
        try {
            const leads = await leadService.getOverdueLeads();
            res.status(200).json(leads);
        } catch (error) {
            console.error('[LeadController] GetOverdue error:', error.message);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * PATCH /leads/:id/ai-status
     * Update AI status for a lead (toggle AI on/off)
     */
    async updateAiStatus(req, res) {
        try {
            const { ai_status } = req.body;

            // Validate status
            const validStatuses = ['active', 'paused', 'human_intervention'];
            if (!validStatuses.includes(ai_status)) {
                return res.status(400).json({
                    error: `ai_status deve ser: ${validStatuses.join(', ')}`
                });
            }

            const lead = await leadService.update(req.params.id, {
                ai_status,
                ai_paused_at: ai_status !== 'active' ? new Date() : null,
            });

            console.log(`[LeadController] AI status updated for lead ${lead.id}: ${ai_status}`);
            res.status(200).json(lead);
        } catch (error) {
            console.error('[LeadController] UpdateAiStatus error:', error.message);
            res.status(400).json({ error: error.message });
        }
    }
}

module.exports = new LeadController();

