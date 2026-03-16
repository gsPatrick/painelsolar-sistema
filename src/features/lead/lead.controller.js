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
                search: req.query.search,
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

            // SOCKET: Emit delete event
            const io = req.app.get('io');
            if (io) {
                io.emit('lead_deleted', { id: req.params.id });
            }

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

    /**
     * GET /leads/export
     * Export all leads as CSV for backup
     */
    async exportCsv(req, res) {
        try {
            const { Lead } = require('../../models');

            // Fetch ALL leads (including deleted/blocked)
            const leads = await Lead.findAll({
                order: [['createdAt', 'DESC']],
                paranoid: false, // Include soft-deleted
            });

            // Build CSV content
            const headers = ['Nome', 'Telefone', 'Origem', 'Data Criação', 'Última Interação', 'Status IA', 'Valor Conta', 'Pipeline ID'];
            const rows = leads.map(lead => [
                `"${(lead.name || '').replace(/"/g, '""')}"`,
                lead.phone || '',
                lead.source || 'manual',
                lead.createdAt ? new Date(lead.createdAt).toISOString() : '',
                lead.last_interaction_at ? new Date(lead.last_interaction_at).toISOString() : '',
                lead.ai_status || 'active',
                lead.monthly_bill || '',
                lead.pipeline_id || '',
            ]);

            const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

            // Set headers for CSV download
            const filename = `backup_leads_${new Date().toISOString().split('T')[0]}.csv`;
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

            console.log(`[LeadController] Exporting ${leads.length} leads to CSV`);
            res.status(200).send('\uFEFF' + csvContent); // BOM for Excel UTF-8 compatibility

        } catch (error) {
            console.error('[LeadController] ExportCsv error:', error.message);
            res.status(500).json({ error: error.message });
        }
    }

    async getStats(req, res) {
        try {
            const { Lead } = require('../../models');

            const totalLeads = await Lead.count({ paranoid: false });
            const activeLeads = await Lead.count({ where: { ai_status: 'active' } });
            const lastLead = await Lead.findOne({
                order: [['createdAt', 'DESC']],
                paranoid: false,
            });

            // Get recent 50 leads for preview
            const recentLeads = await Lead.findAll({
                order: [['createdAt', 'DESC']],
                limit: 50,
                paranoid: false,
                attributes: ['id', 'name', 'phone', 'source', 'createdAt', 'last_interaction_at', 'ai_status'],
            });

            res.status(200).json({
                total: totalLeads,
                active: activeLeads,
                lastCreated: lastLead?.createdAt || null,
                recentLeads,
            });
        } catch (error) {
            console.error('[LeadController] GetStats error:', error.message);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * POST /leads/:id/recovery
     * Trigger Data Recovery Script Manually
     */
    async sendDataRecovery(req, res) {
        try {
            const { leadService } = require('./lead.service'); // Ensure service is available if not global
            const openAIService = require('../../services/OpenAIService');
            const whatsAppService = require('../../services/WhatsAppService');
            const { SystemSettings, Message, Lead } = require('../../models');

            const leadId = req.params.id;
            const lead = await Lead.findByPk(leadId); // Use direct find to ensure we have the model

            if (!lead) {
                return res.status(404).json({ error: 'Lead não encontrado' });
            }

            // Get Recovery Prompt
            let recoveryPrompt = `═══════════════════════════════════════════════════════════════
🚀 RECUPERAÇÃO DE DADOS (PRIMEIRO CONTATO):
═══════════════════════════════════════════════════════════════
O lead está na fase INICIAL ("Primeiro Contato") mas parou de responder ou não mandou dados.
SEU OBJETIVO TOTAL AGORA É: Obter o valor da conta e o segmento.
Se ele desviar do assunto, use esta abordagem:
"Entendi! Mas para eu conseguir te passar o valor exato da economia, preciso só que você me confirme o valor médio da sua conta. Consegue me enviar agora?"
IGNORE perguntas complexas até ter esses dados. Foco em destravar o lead.`;

            try {
                const setting = await SystemSettings.findOne({ where: { key: 'openai_data_recovery_prompt' } });
                if (setting && setting.value) {
                    recoveryPrompt = setting.value;
                }
            } catch (err) {
                console.warn('Could not load dynamic recovery prompt');
            }

            // Generate AI Response with FORCED Context
            // We pass an empty history to force the AI to start fresh/focus on the instruction
            // Or we pass recent history so it knows what happened. Passing history is safer for coherence.
            const recentMessages = await Message.findAll({
                where: { lead_id: lead.id },
                order: [['timestamp', 'DESC']],
                limit: 5,
            });
            const history = recentMessages.reverse();

            const aiResponse = await openAIService.generateResponse(history, {
                name: lead.name,
                phone: lead.phone,
                // Force pipeline title context just in case
                pipeline_title: 'Primeiro Contato'
            }, recoveryPrompt, lead.id);

            if (aiResponse.success && aiResponse.message) {
                // Save & Send
                await Message.create({
                    lead_id: lead.id,
                    content: aiResponse.message,
                    sender: 'ai',
                    timestamp: new Date(),
                });

                await whatsAppService.sendMessage(lead.phone, aiResponse.message);

                return res.status(200).json({ message: 'Script de recuperação enviado com sucesso!', content: aiResponse.message });
            } else {
                return res.status(500).json({ error: 'Falha ao gerar mensagem da IA' });
            }

        } catch (error) {
            console.error('[LeadController] SendDataRecovery error:', error.message);
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new LeadController();

