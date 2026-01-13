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
            const { lead_ids, content } = req.body;
            console.log(`[MessageController] Bulk send validation - Lead IDs type: ${typeof lead_ids}, Is Array: ${Array.isArray(lead_ids)}, Value:`, lead_ids);

            if (!lead_ids || !Array.isArray(lead_ids) || lead_ids.length === 0) {
                return res.status(400).json({ error: 'lead_ids must be a non-empty array' });
            }
            if (!content) {
                return res.status(400).json({ error: 'content is required' });
            }

            const { Lead } = require('../../models');
            const whatsAppService = require('../../services/WhatsAppService');

            // Process in background to avoid timeout
            // But for now, we'll confirm start and run logic
            // Ideally should be a queue. For MVP, we iterate.

            let successCount = 0;
            let failCount = 0;

            // Fetch all leads first
            const leads = await Lead.findAll({
                where: {
                    id: lead_ids
                }
            });

            console.log(`[MessageController] Starting bulk send to ${leads.length} leads...`);

            // Send async (don't wait for all to return response to user)
            // But user wants feedback. Let's do a quick loop.
            // Heavily rate limited? 

            const results = [];

            for (const lead of leads) {
                try {
                    // Personalize message
                    const firstName = lead.name ? lead.name.split(' ')[0] : 'Cliente';
                    const personalizedContent = content.replace(/{nome}/gi, firstName);

                    // Send
                    await whatsAppService.sendMessage(lead.phone, personalizedContent, 0); // No typing delay for bulk

                    // Save to DB
                    await messageService.create({
                        lead_id: lead.id,
                        content: personalizedContent,
                        sender: 'ai', // Mark as AI for history tracking
                        timestamp: new Date()
                    });

                    // Pause AI
                    if (lead.ai_status !== 'human_intervention') {
                        lead.ai_status = 'human_intervention';
                        lead.ai_paused_at = new Date();
                        await lead.save();
                    }

                    results.push({ lead_id: lead.id, status: 'success' });
                    successCount++;

                    // Small delay to prevent block
                    await new Promise(r => setTimeout(r, 500));

                } catch (err) {
                    console.error(`[MessageController] Bulk send failed for ${lead.phone}:`, err.message);
                    results.push({ lead_id: lead.id, status: 'error', error: err.message });
                    failCount++;
                }
            }

            res.json({
                message: 'Bulk send completed',
                total: leads.length,
                success: successCount,
                failed: failCount,
                results
            });

        } catch (error) {
            console.error('[MessageController] Bulk send error:', error);
            res.status(500).json({ error: 'Internal server error during bulk send' });
        }
    }
};

module.exports = messageController;
