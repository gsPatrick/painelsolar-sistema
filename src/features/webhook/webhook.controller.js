const { Lead, Message, Pipeline, SystemSettings, AdminNumber } = require('../../models');
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

        // Ensure LID is linked if provided
        if (chatLid && !phone.includes('@lid')) {
            await this.ensureLeadLid(phone, chatLid);
        }

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

            // Handle LID-only phone numbers
            const isLidOnly = phone.includes('@lid');
            const actualPhone = isLidOnly ? '' : phone; // Leave empty if only LID
            const lidValue = isLidOnly ? phone : (chatLid || null);

            lead = await Lead.create({
                name: senderName, // Use extracted name or fallback
                phone: actualPhone,
                whatsapp_lid: lidValue,
                source: 'whatsapp',
                pipeline_id: targetPipeline.id,
                last_interaction_at: new Date(),
            });

            console.log(`[Webhook] Created new lead: ${lead.id} (phone: ${actualPhone || 'LID only'}, LID: ${lidValue}) in pipeline: ${targetPipeline.title}`);
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
            const { name, monthly_bill, city, state } = extractedInfo.data;

            // Update lead info if found
            if (name && lead.name.startsWith('WhatsApp')) {
                lead.name = name;
            }
            if (monthly_bill) lead.monthly_bill = monthly_bill;
            if (city) lead.city = city;
            if (state) lead.state = state;

            await lead.save();

            // Check if lead has all required info to move to "Enviar Proposta"
            await this.checkLeadCompletion(lead, phone);
        }
    }

    /**
     * Check if lead has all required info and move to "Enviar Proposta" + notify admins
     */
    async checkLeadCompletion(lead, phone) {
        try {
            // Reload lead to get latest data
            await lead.reload();

            // Check if lead has the essential info (bill value OR city mentioned in messages)
            const hasEssentialInfo = lead.monthly_bill || lead.city;

            if (!hasEssentialInfo) {
                return; // Not complete yet
            }

            // Check if already moved (not in "Primeiro Contato")
            const primeiroContato = await Pipeline.findOne({ where: { title: 'Primeiro Contato' } });
            if (!primeiroContato || lead.pipeline_id !== primeiroContato.id) {
                return; // Already moved or not in first stage
            }

            // Move to "Enviar Proposta"
            const enviarProposta = await Pipeline.findOne({ where: { title: 'Enviar Proposta' } });
            if (!enviarProposta) {
                console.warn('[Webhook] "Enviar Proposta" pipeline not found');
                return;
            }

            lead.pipeline_id = enviarProposta.id;
            lead.ai_enabled = false; // Disable AI - human takes over
            await lead.save();

            console.log(`[Webhook] Lead ${lead.id} (${lead.name}) moved to "Enviar Proposta"`);

            // Send notification to all active admin numbers
            await this.notifyAdminsAboutLead(lead);

        } catch (error) {
            console.error('[Webhook] Error checking lead completion:', error.message);
        }
    }

    /**
     * Send WhatsApp notification to all active admin numbers about a lead ready for proposal
     */
    async notifyAdminsAboutLead(lead) {
        try {
            const adminNumbers = await AdminNumber.findAll({
                where: { active: true }
            });

            if (adminNumbers.length === 0) {
                console.log('[Webhook] No active admin numbers to notify');
                return;
            }

            // Build summary message
            const message = `🔔 *NOVO LEAD PRONTO PARA PROPOSTA*

👤 *Nome:* ${lead.name || 'Não informado'}
📞 *Telefone:* ${lead.phone}
📍 *Cidade:* ${lead.city || 'Não informada'}
💡 *Conta de Luz:* ${lead.monthly_bill ? `R$ ${lead.monthly_bill}` : 'Não informada'}

⏰ *Recebido em:* ${new Date(lead.createdAt).toLocaleString('pt-BR')}

📋 Este lead completou o atendimento inicial e está aguardando uma proposta comercial!`;

            // Send to all admin numbers
            for (const admin of adminNumbers) {
                try {
                    await whatsAppService.sendMessage(admin.phone, message);
                    console.log(`[Webhook] Notified admin ${admin.name} (${admin.phone}) about lead ${lead.id}`);
                } catch (err) {
                    console.error(`[Webhook] Failed to notify admin ${admin.name}:`, err.message);
                }
            }

        } catch (error) {
            console.error('[Webhook] Error notifying admins:', error.message);
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
     * Process Meta Lead Ads lead - OPTIMIZED FOR SPEED
     * Priority: Dispatch AI immediately, enrich campaign data in background
     */
    async processMetaLead(leadData) {
        const metaService = require('../../services/MetaService');
        const { leadgen_id, ad_id, form_id, page_id } = leadData;

        console.log('\n🚀🚀🚀 LEAD META DETECTADO - PROCESSAMENTO PRIORITÁRIO! 🚀🚀🚀');
        console.log(`[Meta] leadgen_id: ${leadgen_id}`);

        // STEP 1: Quick fetch - only get basic lead info (name + phone)
        let leadBasicData = { name: 'Meta Lead', phone: null };

        try {
            if (metaService.isConfigured()) {
                const rawLeadData = await metaService.getLeadData(leadgen_id);
                const fields = metaService.parseFieldData(rawLeadData.field_data || []);
                leadBasicData.name = fields.name || 'Meta Lead';
                leadBasicData.phone = fields.phone || null;
                console.log(`[Meta] ⚡ Dados básicos obtidos: ${leadBasicData.name} - ${leadBasicData.phone}`);
            }
        } catch (err) {
            console.warn('[Meta] Erro ao buscar dados básicos:', err.message);
        }

        // STEP 2: Find pipeline
        let targetPipeline = await Pipeline.findOne({ where: { title: 'Primeiro Contato' } });
        if (!targetPipeline) {
            targetPipeline = await Pipeline.findOne({ order: [['order_index', 'ASC']] });
        }

        // STEP 3: Check if lead exists or create new one
        let lead = null;
        if (leadBasicData.phone) {
            lead = await leadService.findByPhone(leadBasicData.phone);
        }

        if (lead) {
            lead.last_interaction_at = new Date();
            await lead.save();
            console.log(`[Meta] Lead existente atualizado: ${lead.id}`);
        } else {
            lead = await Lead.create({
                name: leadBasicData.name,
                phone: leadBasicData.phone || '',
                source: 'meta_ads',
                meta_leadgen_id: leadgen_id,
                pipeline_id: targetPipeline?.id || null,
                last_interaction_at: new Date(),
            });
            console.log(`🚀 LEAD META DETECTADO: ${lead.name} - Disparando Sol AGORA!`);
        }

        // STEP 4: 🎯 DISPATCH AI IMMEDIATELY - ZERO DELAY
        if (lead.phone) {
            console.log(`[Meta] 🔥 Disparando IA Sol para ${lead.phone}...`);

            try {
                const aiResponse = await openAIService.generateResponse([], {
                    name: lead.name,
                    phone: lead.phone,
                });

                if (aiResponse.success && aiResponse.message) {
                    let responseText = aiResponse.message;
                    let shouldSendVideo = responseText.includes('[ENVIAR_VIDEO_PROVA_SOCIAL]');

                    if (shouldSendVideo) {
                        responseText = responseText.replace('[ENVIAR_VIDEO_PROVA_SOCIAL]', '').trim();
                    }

                    // Save message
                    await Message.create({
                        lead_id: lead.id,
                        content: responseText,
                        sender: 'ai',
                        timestamp: new Date(),
                    });

                    // Send via WhatsApp - minimal delay
                    await whatsAppService.sendMessage(lead.phone, responseText, 2);
                    console.log(`[Meta] ✅ Sol respondeu Meta lead: ${lead.phone}`);

                    // Video in background (if needed)
                    if (shouldSendVideo) {
                        const videoUrl = process.env.PROVA_SOCIAL_VIDEO_URL;
                        if (videoUrl) {
                            whatsAppService.sendVideo(lead.phone, videoUrl, '👆 Confira o depoimento!', { delayTyping: 2 })
                                .catch(e => console.warn('[Meta] Video send error:', e.message));
                        }
                    }
                }
            } catch (error) {
                console.error('[Meta] ❌ Erro ao enviar saudação:', error.message);
            }
        } else {
            console.warn('[Meta] ⚠️ Sem telefone - não foi possível disparar IA');
        }

        // STEP 5: BACKGROUND - Enrich with campaign data (non-blocking)
        this.enrichMetaLeadCampaignData(lead, leadgen_id, ad_id).catch(err => {
            console.warn('[Meta] Background enrichment failed:', err.message);
        });

        return lead;
    }

    /**
     * Background enrichment of campaign data (non-blocking)
     */
    async enrichMetaLeadCampaignData(lead, leadgen_id, ad_id) {
        const metaService = require('../../services/MetaService');

        if (!metaService.isConfigured() || !ad_id) return;

        try {
            console.log(`[Meta] 📊 Buscando dados de campanha em background para lead ${lead.id}...`);

            const adData = await metaService.getAdData(ad_id);
            const campaignData = {};

            if (adData.campaign_id) {
                const campaign = await metaService.getCampaignData(adData.campaign_id);
                campaignData.campaign_name = campaign.name;
                campaignData.campaign_id = adData.campaign_id;
            }

            if (adData.adset_id) {
                const adset = await metaService.getAdSetData(adData.adset_id);
                campaignData.adset_name = adset.name;
                campaignData.adset_id = adData.adset_id;
            }

            campaignData.ad_name = adData.name;
            campaignData.ad_id = ad_id;

            // Update lead with campaign data
            lead.meta_campaign_data = campaignData;
            await lead.save();

            console.log(`[Meta] ✅ Dados de campanha salvos: ${campaignData.campaign_name || 'N/A'}`);
        } catch (error) {
            console.warn('[Meta] Erro no enriquecimento de campanha:', error.message);
        }
    }

    /**
     * GET /webhook/meta (for verification)
     */
    verifyMetaWebhook(req, res) {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        // Your verify token (set in Meta dashboard)
        const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'dge_energia_segredo_2026';

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

    /**
     * POST /webhook/meta/sync
     * Manually sync/import leads from Meta (backfill)
     */
    async syncMetaLeads(req, res) {
        try {
            const { page_id, form_id, limit = 100 } = req.body;
            const metaService = require('../../services/MetaService');

            if (!metaService.isConfigured()) {
                return res.status(400).json({
                    error: 'Meta API não configurada. Configure META_PAGE_ACCESS_TOKEN no .env'
                });
            }

            console.log('[Webhook] Starting Meta leads sync...');

            let rawLeads = [];

            if (form_id) {
                // Sync from specific form
                rawLeads = await metaService.getFormLeads(form_id, limit);
            } else if (page_id) {
                // Sync from all forms of a page
                rawLeads = await metaService.getAllPageLeads(page_id, limit);
            } else {
                return res.status(400).json({
                    error: 'Informe page_id ou form_id'
                });
            }

            console.log(`[Webhook] Found ${rawLeads.length} leads to process`);

            let imported_count = 0;
            let skipped_count = 0;
            const errors = [];

            for (const rawLead of rawLeads) {
                try {
                    const leadgenId = rawLead.id;

                    // Check if lead already exists by leadgen_id
                    const existingByLeadgen = await Lead.findOne({
                        where: { meta_leadgen_id: leadgenId }
                    });

                    if (existingByLeadgen) {
                        skipped_count++;
                        continue;
                    }

                    // Get complete lead data with campaign info
                    const completeData = await metaService.getCompleteLeadData(leadgenId, rawLead.ad_id);

                    // Check if lead exists by phone
                    if (completeData.phone) {
                        const existingByPhone = await leadService.findByPhone(completeData.phone);
                        if (existingByPhone) {
                            // Update existing with meta data
                            existingByPhone.meta_leadgen_id = leadgenId;
                            existingByPhone.meta_campaign_data = completeData.meta_campaign_data;
                            if (!existingByPhone.source || existingByPhone.source === 'manual') {
                                existingByPhone.source = 'meta_ads';
                            }
                            await existingByPhone.save();
                            skipped_count++;
                            continue;
                        }
                    }

                    // Process as new lead (reuse webhook logic)
                    await this.processMetaLead({
                        leadgen_id: leadgenId,
                        ad_id: rawLead.ad_id,
                        form_id: rawLead.form_id,
                    });

                    imported_count++;

                } catch (err) {
                    console.error(`[Webhook] Error processing lead ${rawLead.id}:`, err.message);
                    errors.push({ id: rawLead.id, error: err.message });
                }
            }

            console.log(`[Webhook] Sync complete: ${imported_count} imported, ${skipped_count} skipped`);

            res.json({
                status: 'success',
                imported_count,
                skipped_count,
                total_found: rawLeads.length,
                errors: errors.length > 0 ? errors : undefined,
            });

        } catch (error) {
            console.error('[Webhook] Error syncing Meta leads:', error.message);
            res.status(500).json({
                error: 'Erro ao sincronizar leads do Meta',
                details: error.message
            });
        }
    }
}

module.exports = new WebhookController();
