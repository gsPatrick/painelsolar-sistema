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

            // 5. Save to DB
            const message = await messageService.create({
                lead_id,
                content: content || (type === 'audio' ? 'Áudio enviado' : `Arquivo ${type}`),
                sender: 'agent', // Always agent for manual media upload
                timestamp: new Date(),
                type: type || 'image',
                attachment_url: fileUrl
            });

            res.status(201).json(message);
        } catch (error) {
            console.error('[MessageController] Error in createWithMedia:', error);
            res.status(500).json({ error: 'Failed to upload and send media' });
        }
    }
};

module.exports = messageController;
