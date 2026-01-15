const { Lead, Pipeline, Task, Message } = require('../../models');
const pipelineService = require('../pipeline/pipeline.service');
const { Op } = require('sequelize');

class LeadService {
    /**
     * Get all leads with SLA status (excludes deleted/blocked by default)
     */
    async getAll(filters = {}) {
        const where = {
            status: 'active', // Only active leads by default
        };

        if (filters.pipeline_id) {
            where.pipeline_id = filters.pipeline_id;
        }
        if (filters.is_important !== undefined) {
            where.is_important = filters.is_important;
        }
        if (filters.source) {
            where.source = filters.source;
        }
        if (filters.include_all_status) {
            delete where.status; // Include all statuses
        }
        if (filters.search) {
            where[Op.or] = [
                { name: { [Op.like]: `%${filters.search}%` } },
                { phone: { [Op.like]: `%${filters.search}%` } },
            ];
        }

        const leads = await Lead.findAll({
            where,
            include: [{
                model: Pipeline,
                as: 'pipeline',
            }],
            order: [['last_interaction_at', 'DESC']],
        });

        // Calculate SLA status for each lead
        return leads.map(lead => this.addSlaStatus(lead));
    }

    /**
     * Get lead by ID
     */
    async getById(id) {
        const lead = await Lead.findByPk(id, {
            include: [
                { model: Pipeline, as: 'pipeline' },
                { model: Task, as: 'tasks', order: [['due_date', 'ASC']] },
                { model: Message, as: 'messages', order: [['timestamp', 'DESC']], limit: 50 },
            ],
        });

        if (!lead) {
            throw new Error('Lead não encontrado');
        }

        return this.addSlaStatus(lead);
    }

    /**
     * Create a new lead
     */
    async create(data) {
        const { name, phone, source, meta_campaign_data, is_important, pipeline_id, proposal_value, system_size_kwp } = data;

        // If no pipeline_id, assign to first pipeline
        let assignedPipelineId = pipeline_id;
        if (!assignedPipelineId) {
            const firstPipeline = await pipelineService.getFirstPipeline();
            if (firstPipeline) {
                assignedPipelineId = firstPipeline.id;
            }
        }

        // Get max order_index in the pipeline
        const maxOrder = await Lead.max('order_index', {
            where: { pipeline_id: assignedPipelineId },
        }) || 0;

        const lead = await Lead.create({
            name,
            phone,
            source: source || 'manual',
            status: 'active',
            meta_campaign_data: meta_campaign_data || {},
            is_important: is_important || false,
            pipeline_id: assignedPipelineId,
            order_index: maxOrder + 1,
            proposal_value: proposal_value || 0,
            system_size_kwp: system_size_kwp || 0,
            last_interaction_at: new Date(),
        });

        return lead;
    }

    /**
     * Update a lead
     */
    async update(id, data) {
        const lead = await Lead.findByPk(id);
        if (!lead) {
            throw new Error('Lead não encontrado');
        }

        const allowedFields = [
            'name', 'phone', 'source', 'meta_campaign_data', 'is_important',
            'proposal_value', 'system_size_kwp', 'human_takeover',
        ];

        for (const field of allowedFields) {
            if (data[field] !== undefined) {
                lead[field] = data[field];
            }
        }

        // Update last interaction
        lead.last_interaction_at = new Date();
        await lead.save();

        return this.addSlaStatus(lead);
    }

    /**
     * Move lead to another pipeline (column)
     * This triggers auto follow-up task creation
     */
    async moveToPipeline(leadId, pipelineId, newOrderIndex) {
        const lead = await Lead.findByPk(leadId);
        if (!lead) {
            throw new Error('Lead não encontrado');
        }

        const pipeline = await Pipeline.findByPk(pipelineId);
        if (!pipeline) {
            throw new Error('Pipeline não encontrado');
        }

        const oldPipelineId = lead.pipeline_id;
        lead.pipeline_id = pipelineId;
        lead.last_interaction_at = new Date();
        lead.followup_count = 0; // Reset follow-up sequence
        lead.last_followup_rule_id = null; // Reset last rule tracked for the new pipeline

        if (newOrderIndex !== undefined) {
            lead.order_index = newOrderIndex;
        }

        await lead.save();

        // Check for auto follow-up task creation
        await this.createAutoFollowUpTask(lead, pipeline);

        return this.addSlaStatus(lead);
    }

    /**
     * Create auto follow-up task based on pipeline
     */
    async createAutoFollowUpTask(lead, pipeline) {
        const pipelineTitle = pipeline.title.toLowerCase();
        let daysToAdd = 0;
        let taskTitle = '';

        if (pipelineTitle.includes('proposta enviada')) {
            daysToAdd = 2;
            taskTitle = 'Follow-up: Verificar interesse na proposta';
        } else if (pipelineTitle.includes('negociação') || pipelineTitle.includes('negociacao')) {
            daysToAdd = 3;
            taskTitle = 'Follow-up: Acompanhar negociação';
        }

        if (daysToAdd > 0) {
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + daysToAdd);

            await Task.create({
                lead_id: lead.id,
                title: taskTitle,
                due_date: dueDate,
                status: 'pending',
                type: 'FOLLOW_UP',
            });

            console.log(`[LeadService] Auto follow-up task created for lead ${lead.id} (${daysToAdd} days)`);
        }
    }

    /**
     * Reorder leads within a pipeline
     */
    async reorderLeads(pipelineId, orderedLeadIds) {
        for (let i = 0; i < orderedLeadIds.length; i++) {
            await Lead.update(
                { order_index: i, pipeline_id: pipelineId },
                { where: { id: orderedLeadIds[i] } }
            );
        }

        return this.getAll({ pipeline_id: pipelineId });
    }

    /**
     * Soft delete a lead (can be restored if contacts again)
     */
    async delete(id) {
        const lead = await Lead.findByPk(id);
        if (!lead) {
            throw new Error('Lead não encontrado');
        }

        lead.status = 'deleted';
        lead.deleted_at = new Date();
        await lead.save();

        return { message: 'Lead excluído com sucesso', id };
    }

    /**
     * Hard delete a lead (permanent)
     */
    async hardDelete(id) {
        const lead = await Lead.findByPk(id);
        if (!lead) {
            throw new Error('Lead não encontrado');
        }

        await lead.destroy();
        return { message: 'Lead excluído permanentemente', id };
    }

    /**
     * Block a lead (won't be created even if contacts again)
     */
    async block(id) {
        const lead = await Lead.findByPk(id);
        if (!lead) {
            throw new Error('Lead não encontrado');
        }

        lead.status = 'blocked';
        await lead.save();

        return { message: 'Lead bloqueado com sucesso', id, lead };
    }

    /**
     * Restore a deleted/blocked lead
     */
    async restore(id) {
        const lead = await Lead.findByPk(id);
        if (!lead) {
            throw new Error('Lead não encontrado');
        }

        lead.status = 'active';
        lead.deleted_at = null;
        await lead.save();

        return { message: 'Lead restaurado com sucesso', id, lead };
    }

    /**
     * Find lead by phone number (includes deleted but not blocked)
     */
    async findByPhone(phone) {
        // If it's a LID (Linked Device ID), searching by exact match in whatsapp_lid
        if (typeof phone === 'string' && phone.includes('@lid')) {
            return Lead.findOne({
                where: {
                    whatsapp_lid: phone,
                    status: {
                        [Op.ne]: 'blocked',
                    },
                },
            });
        }

        const cleanPhone = phone.replace(/\D/g, '');
        return Lead.findOne({
            where: {
                phone: {
                    [Op.like]: `%${cleanPhone.slice(-9)}%`, // Match last 9 digits
                },
                status: {
                    [Op.ne]: 'blocked', // Not blocked
                },
            },
        });
    }

    /**
     * Check if phone is blocked
     */
    async isPhoneBlocked(phone) {
        const cleanPhone = phone.replace(/\D/g, '');
        const blocked = await Lead.findOne({
            where: {
                phone: {
                    [Op.like]: `%${cleanPhone.slice(-9)}%`,
                },
                status: 'blocked',
            },
        });
        return !!blocked;
    }

    /**
     * Get leads with SLA alerts (RED status - 3+ days overdue)
     */
    async getSlaAlerts() {
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

        const leads = await Lead.findAll({
            where: {
                status: 'active',
                last_interaction_at: {
                    [Op.lt]: threeDaysAgo,
                },
            },
            include: [{ model: Pipeline, as: 'pipeline' }],
            order: [['last_interaction_at', 'ASC']],
        });

        return leads.map(lead => {
            const leadData = lead.toJSON();
            const now = new Date();
            const lastInteraction = new Date(leadData.last_interaction_at);
            const daysPassed = Math.floor((now - lastInteraction) / (1000 * 60 * 60 * 24));
            leadData.days_overdue = daysPassed;
            leadData.sla_status = 'RED';
            return leadData;
        });
    }

    /**
     * Get leads with SLA issues (overdue)
     */
    async getOverdueLeads() {
        const pipelines = await Pipeline.findAll();
        const overdueLeads = [];

        for (const pipeline of pipelines) {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - pipeline.sla_limit_days);

            const leads = await Lead.findAll({
                where: {
                    pipeline_id: pipeline.id,
                    status: 'active',
                    last_interaction_at: {
                        [Op.lt]: cutoffDate,
                    },
                },
                include: [{ model: Pipeline, as: 'pipeline' }],
            });

            overdueLeads.push(...leads);
        }

        return overdueLeads;
    }

    /**
     * Add SLA status to lead
     */
    addSlaStatus(lead) {
        const leadData = lead.toJSON ? lead.toJSON() : lead;
        const pipeline = leadData.pipeline;

        if (!pipeline) {
            leadData.sla_status = 'UNKNOWN';
            return leadData;
        }

        leadData.sla_status = pipelineService.calculateSlaStatus(
            leadData.last_interaction_at,
            pipeline.sla_limit_days
        );

        return leadData;
    }
}

module.exports = new LeadService();

