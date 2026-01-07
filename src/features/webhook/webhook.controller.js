const { Lead, Message, Pipeline, SystemSettings } = require('../../models');
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

            const { phone, message, isFromMe, isFromApi, chatLid } = messageData;
            console.log(`[Webhook Debug] Extracted: phone=${phone}, isFromMe=${isFromMe}, isFromApi=${isFromApi}, msg=${message}, chatLid=${chatLid}`);

            // Link LID to Phone if available (Critical for finding lead later when using only LID)
            if (chatLid && phone && !phone.includes('@lid')) {
                await this.ensureLeadLid(phone, chatLid);
            }

            // HUMAN HANDOVER: If message is from the business phone/system, pause AI for this lead
            // CRITICAL: Only pause if it was NOT sent via API (meaning it was typed manually on the phone by a human)
            if (isFromMe && !isFromApi) {
                await this.handleHumanIntervention(phone, req.app.get('io'));
                return res.status(200).json({ message: 'Human intervention detected (Manual Message), AI paused' });
            }

            // If it's from me via API (Bot), ignore it
            if (isFromMe && isFromApi) {
                console.log('[Webhook] Message sent via API (Bot). Ignoring.');
                return res.status(200).json({ message: 'Bot message ignored' });
            }

            // Extract sender name
            const senderName = payload.senderName || payload.notifyName || payload.name || `WhatsApp ${phone}`;

            // Process incoming message
            await this.processIncomingMessage(phone, message, senderName, chatLid);

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
        console.log('[Webhook] Extracting data from payload:', JSON.stringify(payload, null, 2));

        const isFromApi = payload.fromApi === true;
        const isFromMe = payload.fromMe === true || payload.fromApi === true || payload.isFromMe === true || (payload.type === 'ReceivedCallback' && payload.fromApi === true);

        // 1. Text message found in payload.text
        if (payload.text && payload.phone) {
            return {
                phone: payload.phone,
                message: payload.text.message || payload.text,
                isFromMe: isFromMe,
                isFromApi: isFromApi,
                chatLid: payload.chatLid || (payload.from && payload.from.includes('@lid') ? payload.from : null)
            };
        }

        // 2. Message object wrapper
        if (payload.message && payload.message.text) {

            const messageIsFromMe = isFromMe || payload.message.isFromMe || payload.message.fromMe || false;

            return {
                phone: payload.phone || payload.from,
                message: payload.message.text,
                isFromMe: messageIsFromMe,
            };
        }

        // 3. Body/From format (common in some webhooks)
        if (payload.body && payload.from) {
            return {
                phone: payload.from.replace('@c.us', ''),
                message: payload.body,
                isFromMe: isFromMe,
            };
        }

        console.log('[Webhook] Could not extract message data from payload');
        return null;
    }

    /**
     * Handle human intervention - pause AI for this lead
     */
    async handleHumanIntervention(phone, io) {
        console.log(`[Webhook Debug] Handling Human Intervention for phone: ${phone}`);
        try {
            const lead = await leadService.findByPhone(phone);
            if (!lead) console.log(`[Webhook Debug] Lead not found for phone: ${phone}`);
            if (lead) {
                lead.ai_status = 'human_intervention';
                lead.ai_paused_at = new Date();
                await lead.save();
                console.log(`[Webhook] Human intervention detected. AI paused for lead ${lead.id} (${lead.name})`);

                if (io) {
                    io.emit('ai_paused_notification', {
                        leadId: lead.id,
                        leadName: lead.name,
                        timestamp: new Date()
                    });
                }
            }
        } catch (error) {
            console.error('[Webhook] Error handling human intervention:', error.message);
        }
    }

    /**
     * Process incoming WhatsApp message
     */
    async processIncomingMessage(phone, messageText, senderName, chatLid) {
        // ... (preserving logic) ...
        console.log(`[Webhook] Processing message from ${phone}: ${messageText}`);

        // --- TEST MODE WHITELIST ---
        const cleanPhone = phone.replace(/\D/g, '');
        const allowedNumbers = ['557182862912', '1982862912', '5571982862912'];
        const isAllowed = allowedNumbers.some(num => cleanPhone.includes(num) || num.includes(cleanPhone));

        if (!isAllowed) {
            console.log(`[Webhook] IGNORING message from ${phone} (Not in whitelist)`);
            return;
        }

        // Ensure LID is linked if provided
        if (chatLid && !phone.includes('@lid')) {
            await this.ensureLeadLid(phone, chatLid);
        }
        // ---------------------------

        // Find or create lead
        let lead = await leadService.findByPhone(phone);

        // Use provided senderName or fallback
        senderName = senderName || `WhatsApp ${phone}`;

        if (!lead) {
            // Create new lead in 'Primeiro Contato' pipeline
            let targetPipeline = await Pipeline.findOne({
                where: { title: 'Primeiro Contato' }
            });

            if (!targetPipeline) {
                // Fallback to first pipeline by order if 'Primeiro Contato' doesn't exist
                targetPipeline = await Pipeline.findOne({
                    order: [['order_index', 'ASC']],
                });
            }

            // If absolutely no pipeline exists (edge case), create one
            if (!targetPipeline) {
                targetPipeline = await Pipeline.create({
                    title: 'Primeiro Contato',
                    color: '#F59E0B',
                    order_index: 1,
                    sla_limit_days: 2
                });
            }

            lead = await Lead.create({
                name: senderName, // Use extracted name or fallback
                phone,
                source: 'whatsapp',
                pipeline_id: targetPipeline.id,
                last_interaction_at: new Date(),
            });

            console.log(`[Webhook] Created new lead: ${lead.id} in pipeline: ${targetPipeline.title}`);
        } else if (lead.name.startsWith('WhatsApp') && senderName !== `WhatsApp ${phone}`) {
            // Update name if we have a better one now
            lead.name = senderName;
            await lead.save();
        }

        // Update last interaction and reset follow-up count (restart sequence)
        lead.last_interaction_at = new Date();
        lead.followup_count = 0;
        await lead.save();

        // Save user message
        await Message.create({
            lead_id: lead.id,
            content: messageText,
            sender: 'user',
            timestamp: new Date(),
        });

        // Check if AI is paused for this lead (human takeover OR ai_status)
        if (lead.human_takeover || lead.ai_status !== 'active') {
            console.log(`[Webhook] AI is ${lead.ai_status} for lead ${lead.id}. Skipping AI response.`);
            return;
        }

        // Load dynamic prompt from SystemSettings
        let dynamicPrompt = null;
        try {
            const promptSetting = await SystemSettings.findOne({ where: { key: 'openai_system_prompt' } });
            if (promptSetting) {
                dynamicPrompt = promptSetting.value;
            }
        } catch (err) {
            console.warn('[Webhook] Could not load dynamic prompt, using default');
        }

        // Get recent conversation history
        const recentMessages = await Message.findAll({
            where: { lead_id: lead.id },
            order: [['timestamp', 'DESC']],
            limit: 10,
        });

        // Reverse to get chronological order
        const conversationHistory = recentMessages.reverse();

        // Generate AI response (pass dynamic prompt if available)
        const aiResponse = await openAIService.generateResponse(conversationHistory, {
            name: lead.name,
            phone: lead.phone,
            proposal_value: lead.proposal_value,
            system_size_kwp: lead.system_size_kwp,
        }, dynamicPrompt);

        if (aiResponse.success && aiResponse.message) {
            console.log('[Webhook Debug] AI Raw Response:', aiResponse.message);
            let responseText = aiResponse.message;
            let shouldSendVideo = false;

            // Check for video tag
            if (responseText.includes('[ENVIAR_VIDEO_PROVA_SOCIAL]')) {
                shouldSendVideo = true;
                responseText = responseText.replace('[ENVIAR_VIDEO_PROVA_SOCIAL]', '').trim();
            }

            // Save AI response (cleaned text)
            await Message.create({
                lead_id: lead.id,
                content: responseText,
                sender: 'ai',
                timestamp: new Date(),
            });

            // Send text via WhatsApp (with typing indicator for human-like feel)
            await whatsAppService.sendMessage(phone, responseText, 3);
            console.log(`[Webhook] AI response sent to ${phone}`);

            // Send video if tag was present
            if (shouldSendVideo) {
                const videoUrl = process.env.PROVA_SOCIAL_VIDEO_URL;
                if (videoUrl) {
                    await whatsAppService.sendVideo(
                        phone,
                        videoUrl,
                        '👆 Confira o depoimento de um dos nossos clientes!',
                        { delayTyping: 2 }
                    );
                    console.log(`[Webhook] Social proof video sent to ${phone}`);
                } else {
                    console.warn('[Webhook] PROVA_SOCIAL_VIDEO_URL not configured. Video not sent.');
                }
            }
        } else if (aiResponse.fallbackMessage) {
            // Send fallback message
            await whatsAppService.sendMessage(phone, aiResponse.fallbackMessage, 2);
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

            // Respond quickly to prevent Meta timeout
            res.status(200).send('EVENT_RECEIVED');

            // Meta Lead Ads webhook
            if (payload.object === 'page' && payload.entry && payload.entry.length > 0) {
                for (const entry of payload.entry) {
                    if (entry.changes) {
                        for (const change of entry.changes) {
                            if (change.field === 'leadgen') {
                                // Process asynchronously to not block response
                                this.processMetaLead(change.value).catch(err => {
                                    console.error('[Webhook] Error processing Meta lead:', err.message);
                                });
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[Webhook] Error handling Meta webhook:', error.message);
            // Still respond 200 to prevent retries
            if (!res.headersSent) {
                res.status(200).send('ERROR_LOGGED');
            }
        }
    }

    /**
     * Process Meta Lead Ads lead with full Graph API data retrieval
     */
    async processMetaLead(leadData) {
        console.log('[Webhook] Processing Meta lead:', leadData);

        // Import MetaService here to avoid circular dependencies
        const metaService = require('../../services/MetaService');

        const { leadgen_id, ad_id, form_id, page_id } = leadData;

        let completeLeadData;

        try {
            // Fetch complete lead data with campaign metadata from Graph API
            if (metaService.isConfigured()) {
                completeLeadData = await metaService.getCompleteLeadData(leadgen_id, ad_id);
                console.log('[Webhook] Complete Meta lead data:', JSON.stringify(completeLeadData, null, 2));
            } else {
                console.warn('[Webhook] MetaService not configured. Using basic lead data.');
                completeLeadData = {
                    leadgen_id,
                    name: 'Meta Lead',
                    phone: null,
                    meta_campaign_data: { form_id, page_id, ad_id },
                };
            }
        } catch (error) {
            console.error('[Webhook] Error fetching complete lead data from Meta:', error.message);
            completeLeadData = {
                leadgen_id,
                name: 'Meta Lead',
                phone: null,
                meta_campaign_data: { form_id, page_id, ad_id, error: error.message },
            };
        }

        // Find "Primeiro Contato" pipeline
        let targetPipeline = await Pipeline.findOne({
            where: { title: 'Primeiro Contato' }
        });

        if (!targetPipeline) {
            targetPipeline = await Pipeline.findOne({
                order: [['order_index', 'ASC']],
            });
        }

        // Check if lead already exists by phone
        let lead = null;
        if (completeLeadData.phone) {
            lead = await leadService.findByPhone(completeLeadData.phone);
        }

        if (lead) {
            // Update existing lead with Meta campaign data
            lead.meta_campaign_data = {
                ...lead.meta_campaign_data,
                ...completeLeadData.meta_campaign_data,
            };
            lead.last_interaction_at = new Date();
            await lead.save();
            console.log(`[Webhook] Updated existing lead: ${lead.id} with Meta data`);
        } else {
            // Create new lead with Meta campaign data
            lead = await Lead.create({
                name: completeLeadData.name || 'Meta Lead',
                phone: completeLeadData.phone || '',
                source: 'meta_ads',
                meta_campaign_data: completeLeadData.meta_campaign_data || {},
                pipeline_id: targetPipeline?.id || null,
                last_interaction_at: new Date(),
            });
            console.log(`[Webhook] Created Meta lead: ${lead.id} (${lead.name})`);
        }

        // TRIGGER AI DANIELA GREETING 🎯
        // Send welcome message immediately via WhatsApp if phone is available
        if (lead.phone) {
            try {
                // Get Daniela's opening message
                const recentMessages = []; // No previous messages for new lead
                const aiResponse = await openAIService.generateResponse(recentMessages, {
                    name: lead.name,
                    phone: lead.phone,
                });

                if (aiResponse.success && aiResponse.message) {
                    let responseText = aiResponse.message;
                    let shouldSendVideo = false;

                    // Check for video tag
                    if (responseText.includes('[ENVIAR_VIDEO_PROVA_SOCIAL]')) {
                        shouldSendVideo = true;
                        responseText = responseText.replace('[ENVIAR_VIDEO_PROVA_SOCIAL]', '').trim();
                    }

                    // Save AI message to history
                    await Message.create({
                        lead_id: lead.id,
                        content: responseText,
                        sender: 'ai',
                        timestamp: new Date(),
                    });

                    // Send via WhatsApp with typing delay for human-like feel
                    await whatsAppService.sendMessage(lead.phone, responseText, 3);
                    console.log(`[Webhook] AI Daniela greeting sent to Meta lead: ${lead.phone}`);

                    // Send video if tag was present
                    if (shouldSendVideo) {
                        const videoUrl = process.env.PROVA_SOCIAL_VIDEO_URL;
                        if (videoUrl) {
                            await whatsAppService.sendVideo(
                                lead.phone,
                                videoUrl,
                                '👆 Confira o depoimento de um dos nossos clientes!',
                                { delayTyping: 2 }
                            );
                            console.log(`[Webhook] Social proof video sent to ${lead.phone}`);
                        }
                    }
                }
            } catch (error) {
                console.error('[Webhook] Error sending AI greeting to Meta lead:', error.message);
                // Don't fail the whole process if greeting fails
            }
        }

        return lead;
    }

    /**
     * GET /webhook/meta (for verification)
     */
    verifyMetaWebhook(req, res) {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        // Your verify token (set in Meta dashboard)
        const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'solar_crm_verify';

        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('[Webhook] Meta webhook verified');
            res.status(200).send(challenge);
        } else {
            console.warn('[Webhook] Meta webhook verification failed');
            res.status(403).send('Verification failed');
        }
    }

    /**
     * Ensure Lead has whatsapp_lid saved
     */
    async ensureLeadLid(phone, lid) {
        try {
            const lead = await leadService.findByPhone(phone);
            if (lead && !lead.whatsapp_lid) {
                console.log(`[Webhook] Linking LID ${lid} to Lead ${lead.phone}`);
                lead.whatsapp_lid = lid;
                await lead.save();
            }
        } catch (err) {
            console.error('[Webhook] Error linking LID:', err.message);
        }
    }
}

module.exports = new WebhookController();
