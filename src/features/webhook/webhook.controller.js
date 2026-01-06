const { Lead, Message, Pipeline } = require('../../models');
const leadService = require('../lead/lead.service');
const openAIService = require('../../services/OpenAIService');
const whatsAppService = require('../../services/WhatsAppService');

class WebhookController {
    /**
     * POST /webhook/z-api
     * Receive messages from Z-API WhatsApp
     */
    async handleZApiWebhook(req, res) {
        try {
            const payload = req.body;
            console.log('[Webhook] Received Z-API payload:', JSON.stringify(payload, null, 2));

            // Z-API sends different event types
            const messageData = this.extractMessageData(payload);

            if (!messageData) {
                return res.status(200).json({ message: 'Event ignored' });
            }

            const { phone, message, isFromMe } = messageData;

            // Ignore messages sent by us
            if (isFromMe) {
                return res.status(200).json({ message: 'Outgoing message ignored' });
            }

            // Process incoming message
            await this.processIncomingMessage(phone, message);

            res.status(200).json({ message: 'Processed successfully' });
        } catch (error) {
            console.error('[Webhook] Error handling Z-API webhook:', error.message);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * Extract message data from Z-API payload
     */
    extractMessageData(payload) {
        // Z-API can send different formats
        if (payload.text && payload.phone) {
            return {
                phone: payload.phone,
                message: payload.text.message || payload.text,
                isFromMe: payload.isFromMe || false,
            };
        }

        if (payload.message && payload.message.text) {
            return {
                phone: payload.phone || payload.from,
                message: payload.message.text,
                isFromMe: payload.message.isFromMe || false,
            };
        }

        // Handle other common formats
        if (payload.body && payload.from) {
            return {
                phone: payload.from.replace('@c.us', ''),
                message: payload.body,
                isFromMe: false,
            };
        }

        return null;
    }

    /**
     * Process incoming WhatsApp message
     */
    async processIncomingMessage(phone, messageText) {
        console.log(`[Webhook] Processing message from ${phone}: ${messageText}`);

        // Find or create lead
        let lead = await leadService.findByPhone(phone);

        if (!lead) {
            // Create new lead in first pipeline
            const firstPipeline = await Pipeline.findOne({
                order: [['order_index', 'ASC']],
            });

            lead = await Lead.create({
                name: `WhatsApp ${phone}`,
                phone,
                source: 'whatsapp',
                pipeline_id: firstPipeline?.id || null,
                last_interaction_at: new Date(),
            });

            console.log(`[Webhook] Created new lead: ${lead.id}`);
        }

        // Update last interaction
        lead.last_interaction_at = new Date();
        await lead.save();

        // Save user message
        await Message.create({
            lead_id: lead.id,
            content: messageText,
            sender: 'user',
            timestamp: new Date(),
        });

        // Check if human takeover is enabled
        if (lead.human_takeover) {
            console.log(`[Webhook] Human takeover enabled for lead ${lead.id}. AI skipped.`);
            return;
        }

        // Get recent conversation history
        const recentMessages = await Message.findAll({
            where: { lead_id: lead.id },
            order: [['timestamp', 'DESC']],
            limit: 10,
        });

        // Reverse to get chronological order
        const conversationHistory = recentMessages.reverse();

        // Generate AI response
        const aiResponse = await openAIService.generateResponse(conversationHistory, {
            name: lead.name,
            phone: lead.phone,
            proposal_value: lead.proposal_value,
            system_size_kwp: lead.system_size_kwp,
        });

        if (aiResponse.success && aiResponse.message) {
            // Save AI response
            await Message.create({
                lead_id: lead.id,
                content: aiResponse.message,
                sender: 'ai',
                timestamp: new Date(),
            });

            // Send via WhatsApp
            await whatsAppService.sendMessage(phone, aiResponse.message);
            console.log(`[Webhook] AI response sent to ${phone}`);
        } else if (aiResponse.fallbackMessage) {
            // Send fallback message
            await whatsAppService.sendMessage(phone, aiResponse.fallbackMessage);
        }

        // Try to extract lead info from message
        const extractedInfo = await openAIService.extractLeadInfo(messageText);
        if (extractedInfo.success && extractedInfo.data) {
            const { name, city, state } = extractedInfo.data;
            if (name && lead.name.startsWith('WhatsApp')) {
                lead.name = name;
                await lead.save();
            }
        }
    }

    /**
     * POST /webhook/meta
     * Receive webhook from Meta (Facebook/Instagram Ads)
     */
    async handleMetaWebhook(req, res) {
        try {
            const payload = req.body;
            console.log('[Webhook] Received Meta payload:', JSON.stringify(payload, null, 2));

            // Meta Lead Ads webhook
            if (payload.entry && payload.entry.length > 0) {
                for (const entry of payload.entry) {
                    if (entry.changes) {
                        for (const change of entry.changes) {
                            if (change.field === 'leadgen') {
                                await this.processMetaLead(change.value);
                            }
                        }
                    }
                }
            }

            res.status(200).json({ message: 'Processed successfully' });
        } catch (error) {
            console.error('[Webhook] Error handling Meta webhook:', error.message);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * Process Meta Lead Ads lead
     */
    async processMetaLead(leadData) {
        console.log('[Webhook] Processing Meta lead:', leadData);

        const firstPipeline = await Pipeline.findOne({
            order: [['order_index', 'ASC']],
        });

        // Create lead with Meta campaign data
        const lead = await Lead.create({
            name: leadData.full_name || 'Meta Lead',
            phone: leadData.phone_number || '',
            source: 'meta_ads',
            meta_campaign_data: leadData,
            pipeline_id: firstPipeline?.id || null,
            last_interaction_at: new Date(),
        });

        console.log(`[Webhook] Created Meta lead: ${lead.id}`);

        // Send welcome message if phone is available
        if (lead.phone) {
            const welcomeMessage = `Olá ${lead.name}! 👋\n\nVi que você tem interesse em energia solar. Sou a Carol da DGE Energia e estou aqui para ajudar!\n\nPara começarmos, poderia me dizer qual é o valor aproximado da sua conta de luz?`;
            await whatsAppService.sendMessage(lead.phone, welcomeMessage);
        }

        return lead;
    }

    /**
     * GET /webhook/meta (for verification)
     */
    async verifyMetaWebhook(req, res) {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        // Your verify token (set in Meta dashboard)
        const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'solar_crm_verify';

        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('[Webhook] Meta webhook verified');
            res.status(200).send(challenge);
        } else {
            res.status(403).send('Verification failed');
        }
    }
}

module.exports = new WebhookController();
