const messageService = require('./message.service');

const messageController = {
    async getHistory(req, res) {
        try {
            const { leadId } = req.params;
            const history = await messageService.getHistory(req.user.id, leadId);
            res.json(history);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to fetch message history' });
        }
    },

    async create(req, res) {
        try {
            const { lead_id, content, sender } = req.body;

            // 1. Fetch Lead
            const { Lead } = require('../../models');
            const lead = await Lead.findByPk(lead_id);

            if (!lead) {
                return res.status(404).json({ error: 'Lead not found' });
            }

            // 2. Identify if it's a manual message from operator
            const isManualMessage = sender !== 'ai' && sender !== 'user';
            const finalSender = req.user ? 'agent' : (sender || 'agent');

            // 3. Send via WhatsApp (if not internal note/AI)
            const whatsAppService = require('../../services/WhatsAppService');

            if (finalSender === 'agent') {
                // Send with typing delay (e.g. 2s)
                await whatsAppService.sendMessage(lead.phone, content, 2);

                // 4. PAUSE AI (Human Intervention)
                if (lead.ai_status !== 'human_intervention') {
                    console.log(`[MessageController] Pausing AI for lead ${lead.id} due to manual message`);
                    lead.ai_status = 'human_intervention';
                    lead.ai_paused_at = new Date();
                    await lead.save();

                    // Notify frontend via Socket.IO
                    const io = req.app.get('io');
                    if (io) {
                        console.log(`[MessageController] Emitting ai_paused_notification for lead ${lead.id}`);
                        io.emit('ai_paused_notification', {
                            leadId: lead.id,
                            leadName: lead.name,
                            timestamp: new Date()
                        });
                    }
                }
            }

            // 5. Save to DB
            const message = await messageService.create({
                lead_id,
                content,
                sender: finalSender,
                timestamp: new Date()
            });

            res.status(201).json(message);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to save message' });
        }
    },

    async createWithMedia(req, res) {
        try {
            const { lead_id, content, sender, type } = req.body;
            const file = req.file;

            console.log('[MessageController] createWithMedia called:', { lead_id, type, file: file?.filename });

            if (!file) {
                return res.status(400).json({ error: 'No file uploaded' });
            }

            // 1. Fetch Lead
            const { Lead } = require('../../models');
            const lead = await Lead.findByPk(lead_id);

            if (!lead) {
                return res.status(404).json({ error: 'Lead not found' });
            }

            // 2. Construct public URL
            // Ensure API_URL is set in .env or construct from request
            const protocol = req.protocol;
            const host = req.get('host');
            const fileUrl = `${protocol}://${host}/public/uploads/${file.filename}`;

            console.log('[MessageController] File URL:', fileUrl);

            // 3. Send via WhatsApp
            const whatsAppService = require('../../services/WhatsAppService');
            let whatsappResponse;

            if (type === 'image') {
                whatsappResponse = await whatsAppService.sendImage(lead.phone, fileUrl, content);
            } else if (type === 'video') {
                whatsappResponse = await whatsAppService.sendVideo(lead.phone, fileUrl, content);
            } else if (type === 'audio') {
                whatsappResponse = await whatsAppService.sendAudio(lead.phone, fileUrl);
            } else {
                // Default to document logic if needed or error
                whatsappResponse = await whatsAppService.sendDocument(lead.phone, fileUrl, file.originalname);
            }

            if (!whatsappResponse.success) {
                console.warn('[MessageController] WhatsApp send failed:', whatsappResponse.error);
                // Optionally return error or continue to save to DB (maybe with status 'failed')
            }

            // 4. PAUSE AI (Human Interaction)
            if (lead.ai_status !== 'human_intervention') {
                lead.ai_status = 'human_intervention';
                lead.ai_paused_at = new Date();
                await lead.save();

                // Notify frontend via Socket.IO
                const io = req.app.get('io');
                if (io) {
                    io.emit('ai_paused_notification', {
                        leadId: lead.id,
                        leadName: lead.name,
                        timestamp: new Date()
                    });
                }
            }

            // AUTOMATION: If sending a DOCUMENT (Proposal), move to 'Proposta Enviada'
            // We assume if agent sends a PDF, it's likely the proposal, especially if they are in 'Aguardando Proposta'
            if (type === 'document' || (file && file.mimetype === 'application/pdf')) {
                const { Pipeline } = require('../../models'); // Import Pipeline
                // Check current stage
                const currentPipeline = await Pipeline.findByPk(lead.pipeline_id);

                if (currentPipeline && currentPipeline.title === 'Aguardando Proposta') {
                    const propostaEnviada = await Pipeline.findOne({ where: { title: 'Proposta Enviada' } });

                    if (propostaEnviada) {
                        lead.pipeline_id = propostaEnviada.id;
                        await lead.save();
                        console.log(`[MessageController] Lead ${lead.id} moved to 'Proposta Enviada' after sending document.`);
                    }
                }
            }

            // 5. Save to DB
            const message = await messageService.create({
                lead_id,
                content: content || (type === 'audio' ? 'Áudio enviado' : `Arquivo ${type}`),
                sender: 'agent', // Always agent for manual media upload
                timestamp: new Date(),
                type: type || 'image', // 'document' type requires schema update? let's stick to existing types or 'text' with attachment
                attachment_url: fileUrl
            });

            res.status(201).json(message);
        } catch (error) {
            console.error('[MessageController] Error in createWithMedia:', error);
            res.status(500).json({ error: 'Failed to upload and send media' });
        }
    },

    async bulkSend(req, res) {
        try {
            const { lead_ids, content, options } = req.body;
            console.log(`[MessageController] Bulk send request for ${lead_ids?.length} leads`);

            if (!lead_ids || !Array.isArray(lead_ids) || lead_ids.length === 0) {
                return res.status(400).json({ error: 'lead_ids must be a non-empty array' });
            }
            if (!content) {
                return res.status(400).json({ error: 'content is required' });
            }

            const BulkSenderService = require('../../services/BulkSenderService');

            try {
                const job = await BulkSenderService.startBulkSend(lead_ids, content, options);
                res.status(200).json({
                    message: 'Disparo em massa iniciado em segundo plano.',
                    jobId: job.id,
                    status: job.status
                });
            } catch (err) {
                return res.status(409).json({ error: err.message }); // 409 Conflict if already running
            }

        } catch (error) {
            console.error('[MessageController] Bulk send error:', error);
            res.status(500).json({ error: 'Internal server error during bulk send' });
        }
    },

    async getBulkStatus(req, res) {
        try {
            const BulkSenderService = require('../../services/BulkSenderService');
            const status = BulkSenderService.getStatus();
            res.json(status);
        } catch (error) {
            console.error('[MessageController] Get Bulk Status error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async stopBulkSend(req, res) {
        try {
            const BulkSenderService = require('../../services/BulkSenderService');
            const stopped = BulkSenderService.stopCurrentJob();
            res.json({ success: stopped, message: stopped ? 'Disparo interrompido.' : 'Nenhum disparo em andamento.' });
        } catch (error) {
            console.error('[MessageController] Stop Bulk error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
};

module.exports = messageController;
