const { Lead, Message, Pipeline, FollowUpRule, SystemSettings, AdminNumber } = require('../../models');
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

            // Process incoming message (pass io for socket emissions)
            const audioUrl = messageData.type === 'audio' ? messageData.audioUrl : null;
            await this.processIncomingMessage(phone, message, senderName, chatLid, audioUrl, req.app.get('io'));

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

        // 3. Audio/Voice message
        if (payload.audio || payload.voice || (payload.message && (payload.message.audio || payload.message.voice))) {
            const audioObj = payload.audio || payload.voice || payload.message.audio || payload.message.voice;
            return {
                phone: payload.phone || payload.from.replace('@c.us', ''),
                message: '[AUDIO]', // Placeholder, will be handled in processIncomingMessage
                type: 'audio',
                audioUrl: audioObj.url || audioObj.link, // Z-API usually sends 'link' or 'url'
                isFromMe: isFromMe,
            };
        }

        // 4. Body/From format (common in some webhooks)
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
    async processIncomingMessage(phone, messageText, senderName, chatLid, audioUrl = null, io = null) {
        // ... (preserving logic) ...
        console.log(`[Webhook] Processing message from ${phone}: ${messageText}`);

        // Ensure LID is linked if provided
        if (chatLid && !phone.includes('@lid')) {
            await this.ensureLeadLid(phone, chatLid);
        }

        // Find or create lead
        let lead = await leadService.findByPhone(phone);
        let isNewLead = false;

        // Use provided senderName or fallback
        senderName = senderName || `WhatsApp ${phone}`;

        if (!lead) {
            // Create new lead in 'Entrada' pipeline
            let targetPipeline = await Pipeline.findOne({
                where: { title: 'Entrada' }
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
                    title: 'Entrada',
                    color: '#64748B',
                    order_index: 0,
                    sla_limit_days: 1
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

            isNewLead = true; // Flag to prevent immediate transition

            console.log(`[Webhook] Created new lead: ${lead.id} (phone: ${actualPhone || 'LID only'}, LID: ${lidValue}) in pipeline: ${targetPipeline.title}`);

            // SOCKET: Emit new_lead event for real-time Kanban updates
            if (io) {
                io.emit('new_lead', {
                    id: lead.id,
                    name: lead.name,
                    phone: lead.phone,
                    source: lead.source,
                    pipeline_id: lead.pipeline_id,
                    last_interaction_at: lead.last_interaction_at,
                    createdAt: lead.createdAt
                });
            }
        } else {
            // Se lead existe mas estava DELETADO, reativa ele como NOVO
            if (lead.status === 'deleted') {
                console.log(`[Webhook] ♻️ Reativando lead deletado: ${lead.phone}`);

                // Encontrar pipeline de Entrada
                let entradaPipeline = await Pipeline.findOne({ where: { title: 'Entrada' } });
                if (!entradaPipeline) entradaPipeline = await Pipeline.findOne({ order: [['order_index', 'ASC']] });

                lead.status = 'active';
                lead.deleted_at = null;
                lead.ai_status = 'active'; // Reset AI
                lead.ai_paused_at = null;
                lead.human_takeover = false;
                lead.pipeline_id = entradaPipeline?.id; // Volta para o início
                lead.pipeline_id = entradaPipeline?.id; // Volta para o início
                lead.qualification_complete = false; // Reset qualificação

                // Reset Name to allow AI to update it again if specific name not provided by WhatsApp
                if (senderName.startsWith('WhatsApp')) {
                    lead.name = senderName;
                } else {
                    // If senderName is a real name (e.g. from WhatsApp profile), use it, but maybe verify?
                    // Safer to just keep senderName as it comes from the new payload
                    lead.name = senderName;
                }

                // RESET TOTAL (CUIDADO: Apaga dados anteriores)
                lead.monthly_bill = null;
                lead.segment = null;
                lead.roof_type = null;
                lead.equipment_increase = null;
                lead.city = null;
                lead.state = null;
                lead.neighborhood = null;
                lead.proposal_value = 0;
                lead.system_size_kwp = 0;
                lead.meta_campaign_data = {}; // Limpa dados de campanha antigos se houver? Talvez manter? Melhor limpar para garantir "zerado"

                await lead.save();

                // CRÍTICO: Apagar histórico de mensagens antigas para zerar contexto da IA
                await Message.destroy({ where: { lead_id: lead.id } });
                console.log(`[Webhook] 🗑️ Histórico de mensagens apagado para lead ${lead.phone} (Reset Completo)`);

                await lead.save();

                // SOCKET: Emit update to treat as new/updated lead
                if (io) {
                    // Send as new_lead to force add to column if it wasn't there, or update
                    io.emit('new_lead', {
                        id: lead.id,
                        name: lead.name,
                        phone: lead.phone,
                        source: lead.source,
                        pipeline_id: lead.pipeline_id,
                        last_interaction_at: lead.last_interaction_at,
                        createdAt: lead.createdAt
                    });
                }
                // isNewLead = true; // Mantemos false para permitir transição automática se responder
            }

            if (lead.name.startsWith('WhatsApp') && senderName !== `WhatsApp ${phone}`) {
                lead.name = senderName;
                await lead.save();
            }
        }

        // AUTO-TRANSITION: If lead is in 'Entrada' and responds, move to 'Primeiro Contato'
        // We check current pipeline name.
        // NOTE: We only move if it's NOT a new lead (force them to stay in Entrada for 1st message)
        if (lead.pipeline_id && !isNewLead) {
            const currentPipeline = await Pipeline.findByPk(lead.pipeline_id);
            if (currentPipeline && currentPipeline.title === 'Entrada') {
                const primeiroContatoApi = await Pipeline.findOne({ where: { title: 'Primeiro Contato' } });
                if (primeiroContatoApi) {
                    lead.pipeline_id = primeiroContatoApi.id;
                    console.log(`[Webhook] Lead ${lead.phone} moved from Entrada to Primeiro Contato due to response.`);
                    await lead.save();

                    // SOCKET: Emit update event
                    if (io) {
                        io.emit('lead_update', lead);
                    }
                }
            }
        }

        // Update last interaction and reset follow-up count (restart sequence)
        lead.last_interaction_at = new Date();
        lead.followup_count = 0;
        await lead.save();

        // AUDIO HANDLING: If audioUrl is present, transcribe it
        let finalMessageText = messageText;
        let isAudio = false;

        if (audioUrl) {
            console.log(`[Webhook] 🎤 Voice message received from ${phone}. Transcribing...`);
            const transcription = await openAIService.transcribeAudio(audioUrl);

            if (transcription.success) {
                console.log(`[Webhook] 📝 Transcription: "${transcription.text}"`);
                finalMessageText = transcription.text;
                isAudio = true;

                // Save user message (Original Audio + Transcription)
                const transcriptMsg = await Message.create({
                    lead_id: lead.id,
                    content: `[ÁUDIO TRANSCRITO]: ${finalMessageText}`,
                    sender: 'user',
                    timestamp: new Date(),
                });

                if (io) {
                    io.emit('receive_message', transcriptMsg);
                }
            } else {
                console.warn(`[Webhook] Failed to transcribe audio: ${transcription.error}`);
                // Save as audio placeholder
                const audioMsg = await Message.create({
                    lead_id: lead.id,
                    content: '[ÁUDIO NÃO TRANSCRITO]',
                    sender: 'user',
                    timestamp: new Date(),
                });

                if (io) {
                    io.emit('receive_message', audioMsg);
                }
                return; // Stop if we can't understand
            }
        } else {
            // ANTI-DUPLICATE: Verifique se essa mensagem de texto JÁ existe para este lead nos últimos 10 segundos
            const duplicateMessage = await Message.findOne({
                where: {
                    lead_id: lead.id,
                    content: messageText,
                    sender: 'user',
                    timestamp: { [require('sequelize').Op.gte]: new Date(new Date() - 10000) } // Últimos 10s
                }
            });

            if (duplicateMessage) {
                console.warn(`[Webhook] 🚫 Mensagem duplicada ignorada de ${phone}: "${messageText}"`);
                return;
            }

            // Save user message (Text)
            const textMsg = await Message.create({
                lead_id: lead.id,
                content: messageText,
                sender: 'user',
                timestamp: new Date(),
            });

            if (io) {
                io.emit('receive_message', textMsg);
            }
        }

        // Check if AI is paused for this lead (human takeover OR ai_status)
        if (lead.human_takeover || lead.ai_status !== 'active') {
            console.log(`[Webhook] AI is ${lead.ai_status} for lead ${lead.id}. Skipping AI response.`);
            return;
        }

        // HUMANIZED DELAY:
        // 1. Listening time (if audio): Duration of audio (simulated) + Processing
        // 2. Typing time: Based on response length

        // Simulate listening time for audio (random 3-7s)
        if (isAudio) {
            await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 4000) + 3000));
        }

        // Send "Typing..." (or "Recording..." to imply voice response, but text is safer for now)
        // We actually send typing in sendMessage, but let's do pre-calculation delay here?
        // Actually, let's let generateResponse run first so we know WHAT to type.

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

        // Generate AI response (pass dynamic prompt if available + leadId for double-check)
        const aiResponse = await openAIService.generateResponse(conversationHistory, {
            name: lead.name,
            phone: lead.phone,
            source: lead.source, // For Meta lead handling
            monthly_bill: lead.monthly_bill, // For priority injection
            proposal_value: lead.proposal_value,
            system_size_kwp: lead.system_size_kwp,
            pipeline_title: lead.pipeline ? lead.pipeline.title : null,
            // Full qualification context
            segment: lead.segment,
            roof_type: lead.roof_type,
            equipment_increase: lead.equipment_increase,
            city: lead.city,
            state: lead.state,
            neighborhood: lead.neighborhood
        }, dynamicPrompt, lead.id);

        if (aiResponse.success && aiResponse.message) {
            console.log('[Webhook Debug] AI Raw Response:', aiResponse.message);
            let responseText = aiResponse.message;
            let shouldSendVideo = false;

            // Check for video tag
            if (responseText.includes('[ENVIAR_VIDEO_PROVA_SOCIAL]')) {
                shouldSendVideo = true;
                responseText = responseText.replace('[ENVIAR_VIDEO_PROVA_SOCIAL]', '').trim();
            }

            // Check for FINALIZE tag (qualification complete)
            let shouldFinalize = false;
            if (responseText.includes('[FINALIZAR_ATENDIMENTO]')) {
                shouldFinalize = true;
                responseText = responseText.replace('[FINALIZAR_ATENDIMENTO]', '').trim();
                console.log(`[Webhook] 🎯 FINALIZAR_ATENDIMENTO tag detected for lead ${lead.id}!`);
            }

            // CALCULATE HUMANIZED DELAY FOR TYPING
            // Approx 0.05s per character (very fast typist) to 0.1s
            const charCount = responseText.length;
            const typingDelayMs = Math.min(Math.max(charCount * 60, 2000), 10000); // Min 2s, Max 10s
            const typingDelaySec = Math.ceil(typingDelayMs / 1000);

            console.log(`[Webhook] ⏳ Humanized Delay: Typing for ~${typingDelaySec}s (${charCount} chars)`);

            // Save AI response (cleaned text)
            const aiMsg = await Message.create({
                lead_id: lead.id,
                content: responseText,
                sender: 'ai',
                timestamp: new Date(),
            });

            if (io) {
                io.emit('receive_message', aiMsg);
            }

            // Send text via WhatsApp (with calculated typing delay)
            await whatsAppService.sendMessage(phone, responseText, typingDelaySec);
            console.log(`[Webhook] AI response sent to ${phone}`);

            // Send video if tag was present AND not already sent
            // FIX: Mark as sent BEFORE sending to prevent race condition duplicates
            const campaignData = lead.meta_campaign_data || {};

            if (shouldSendVideo && !campaignData.social_proof_video_sent) {
                const videoUrl = process.env.PROVA_SOCIAL_VIDEO_URL;
                if (videoUrl) {
                    // ATOMIC: Mark as sent BEFORE sending to prevent duplicates
                    campaignData.social_proof_video_sent = true;
                    lead.meta_campaign_data = campaignData;
                    lead.changed('meta_campaign_data', true);
                    await lead.save();
                    console.log(`[Webhook] Video flag set for ${phone} - sending video...`);

                    await whatsAppService.sendVideo(
                        phone,
                        videoUrl,
                        '👆 Confira o depoimento de um dos nossos clientes!',
                        { delayTyping: 2 }
                    );
                    console.log(`[Webhook] ✅ Social proof video sent to ${phone}`);
                } else {
                    console.warn('[Webhook] PROVA_SOCIAL_VIDEO_URL not configured. Video not sent.');
                }
            } else if (shouldSendVideo && campaignData.social_proof_video_sent) {
                console.log(`[Webhook] Video already sent to ${phone}, skipping duplicate.`);
            }

            // === FORCE FINALIZATION ===
            // If AI signaled qualification is complete, move lead to "Aguardando Proposta"
            if (shouldFinalize) {
                const aguardandoProposta = await Pipeline.findOne({ where: { title: 'Aguardando Proposta' } });
                if (aguardandoProposta && lead.pipeline_id !== aguardandoProposta.id) {
                    lead.pipeline_id = aguardandoProposta.id;
                    lead.ai_status = 'human_intervention'; // Pause AI - human takes over
                    lead.ai_paused_at = new Date();
                    lead.qualification_complete = true;
                    await lead.save();

                    console.log(`[Webhook] ✅ Lead ${lead.id} (${lead.name}) FORCE MOVED to "Aguardando Proposta" via FINALIZAR tag!`);

                    if (io) {
                        io.emit('lead_update', lead);
                    }

                    // Notify admins
                    await this.notifyAdminsAboutLead(lead);
                }
            }
        } else if (aiResponse.fallbackMessage) {
            // Send fallback message
            await whatsAppService.sendMessage(phone, aiResponse.fallbackMessage, 2);
        }

        // Try to extract lead info from message
        const extractedInfo = await openAIService.extractLeadInfo(messageText);
        if (extractedInfo.success && extractedInfo.data) {
            const { name, monthly_bill, segment, roof_type, equipment_increase, city, state, neighborhood } = extractedInfo.data;

            let hasUpdates = false;

            // Update lead info if found
            // Update lead info if found
            if (name && lead.name !== name) {
                console.log(`[Webhook] 📝 Updating lead name from "${lead.name}" to "${name}" (AI Extraction)`);
                lead.name = name;
                hasUpdates = true;
            }
            if (monthly_bill && !lead.monthly_bill) {
                lead.monthly_bill = parseFloat(monthly_bill);
                hasUpdates = true;
            }
            if (segment && !lead.segment) {
                lead.segment = segment;
                hasUpdates = true;
            }
            if (roof_type && !lead.roof_type) {
                lead.roof_type = roof_type;
                hasUpdates = true;
            }
            if (equipment_increase && !lead.equipment_increase) {
                lead.equipment_increase = equipment_increase;
                hasUpdates = true;
            }
            if (city && !lead.city) {
                lead.city = city;
                hasUpdates = true;
            }
            if (state && !lead.state) {
                lead.state = state;
                hasUpdates = true;
            }
            if (neighborhood && !lead.neighborhood) {
                lead.neighborhood = neighborhood;
                hasUpdates = true;
            }

            // Check if qualification is complete (essential: monthly_bill + city)
            if (lead.monthly_bill && lead.city && !lead.qualification_complete) {
                lead.qualification_complete = true;
                hasUpdates = true;
                console.log(`[Webhook] ✅ Lead ${lead.id} qualification complete!`);
            }

            if (hasUpdates) {
                await lead.save();
                console.log(`[Webhook] 📝 Lead ${lead.id} updated with extracted info`);
            }

            // Check if lead has all required info to move to next stage + notify admins
            console.log(`[Webhook] Checking completion for lead ${lead.id}... (IO available: ${!!io})`);
            await this.checkLeadCompletion(lead, phone, io);
        }
    }

    /**
     * Check if lead has all required info and move to "Enviar Proposta" + notify admins
     */
    async checkLeadCompletion(lead, phone, io = null) {
        try {
            // Reload lead to get latest data
            await lead.reload();

            // Check if lead has ALL essential info (Strict Qualification)
            // We require: Bill, City, Segment, Roof, Equipment Increase
            const hasEssentialInfo =
                lead.monthly_bill &&
                lead.city &&
                lead.segment &&
                lead.roof_type &&
                lead.equipment_increase;

            if (!hasEssentialInfo) {
                console.log(`[Webhook] Lead ${lead.id} incomplete. Missing: ${!lead.monthly_bill ? 'Bill ' : ''}${!lead.city ? 'City ' : ''}${!lead.segment ? 'Segment ' : ''}${!lead.roof_type ? 'Roof ' : ''}${!lead.equipment_increase ? 'Eq.Increase' : ''}`);
                return; // Not complete yet, keep with AI
            }

            // Check if already moved (not in "Primeiro Contato")
            const primeiroContato = await Pipeline.findOne({ where: { title: 'Primeiro Contato' } });
            if (!primeiroContato || lead.pipeline_id !== primeiroContato.id) {
                return; // Already moved or not in first stage
            }

            // Move to "Aguardando Proposta"
            const enviarProposta = await Pipeline.findOne({ where: { title: 'Aguardando Proposta' } });
            if (!enviarProposta) {
                console.warn('[Webhook] "Aguardando Proposta" pipeline not found');
                return;
            }

            lead.pipeline_id = enviarProposta.id;
            lead.ai_enabled = false; // Disable AI - human takes over
            await lead.save();

            console.log(`[Webhook] Lead ${lead.id} (${lead.name}) moved to "Aguardando Proposta"`);

            if (io) {
                io.emit('lead_update', lead);
                console.log(`[Webhook] 📡 Socket event 'lead_update' emitted for ${lead.phone}`);
            }

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
        let targetPipeline = await Pipeline.findOne({ where: { title: 'Entrada' } });
        if (!targetPipeline) {
            targetPipeline = await Pipeline.findOne({ order: [['order_index', 'ASC']] });
        }

        // STEP 3: Check if lead exists or create new one
        let lead = null;
        if (leadBasicData.phone) {
            lead = await leadService.findByPhone(leadBasicData.phone);
        }

        if (lead) {
            // IDEMPOTENCY CHECK: Verifica se é o mesmo evento de lead (leadgen_id) já processado
            if (lead.meta_leadgen_id === leadgen_id) {
                console.log(`[Meta] ♻️ Evento duplicado ignorado para Lead ${lead.id} (leadgen_id: ${leadgen_id})`);
                return lead;
            }

            // Se é um lead antigo preenchendo formulário NOVO, atualizamos o ID
            // Mas cuidado: se ele preencheu de novo, talvez queira novo contato. Vamos deixar passar, mas passando histórico?
            // Por enquanto, o código atual passa [] (histórico vazio) o que força saudação.
            // Vamos bloquear disparo de IA se o lead já teve interação RECENTE (últimas 24h) para evitar flood.
            const lastInteractionDiff = (new Date() - new Date(lead.last_interaction_at)) / (1000 * 60 * 60); // Horas

            // Se interagiu há menos de 24h e preencheu form de novo, talvez seja melhor não mandar "Oi tudo bem" de novo se já estamos conversando.
            // Mas vamos focar no bug principal: a repetição da saudação para o MESMO evento.
            // A checagem acima (meta_leadgen_id === leadgen_id) já resolve a duplicação do webhook.

            // Atualiza o leadgen_id para o novo
            lead.meta_leadgen_id = leadgen_id;

            // Update name if current name is generic and we have a better one
            if ((lead.name === 'Meta Lead' || lead.name === 'Novo Lead' || lead.name === 'Sem Nome') && leadBasicData.name !== 'Meta Lead') {
                lead.name = leadBasicData.name;
            }
            lead.last_interaction_at = new Date();
            await lead.save();
            console.log(`[Meta] Lead existente atualizado com novo form: ${lead.id}`);
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
                // Reload lead with pipeline to pass pipeline_title to AI context
                lead = await Lead.findByPk(lead.id, {
                    include: [{ model: Pipeline, as: 'pipeline' }]
                });

                const aiResponse = await openAIService.generateResponse([], {
                    name: lead.name,
                    phone: lead.phone,
                    pipeline_title: lead.pipeline ? lead.pipeline.title : null,
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
                    // We use meta_campaign_data to store this flag
                    // FIX: Mark video as sent BEFORE sending to prevent race condition duplicates
                    const campaignData = lead.meta_campaign_data || {};

                    if (shouldSendVideo && !campaignData.social_proof_video_sent) {
                        const videoUrl = process.env.PROVA_SOCIAL_VIDEO_URL;
                        if (videoUrl) {
                            // ATOMIC: Mark as sent BEFORE sending to prevent duplicates
                            campaignData.social_proof_video_sent = true;
                            lead.meta_campaign_data = campaignData;
                            lead.changed('meta_campaign_data', true);
                            await lead.save();
                            console.log(`[Meta] Video flag set for ${lead.phone} - sending video...`);

                            whatsAppService.sendVideo(lead.phone, videoUrl, '👆 Confira o depoimento!', { delayTyping: 2 })
                                .then(() => console.log(`[Meta] ✅ Video sent to ${lead.phone}`))
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
     * POST /webhook/meta/preview
     * List leads available for sync without importing
     */
    async previewMetaLeads(req, res) {
        try {
            const { page_id, form_id, limit = 100 } = req.body;
            const metaService = require('../../services/MetaService');

            if (!metaService.isConfigured()) {
                return res.status(400).json({ error: 'Meta API não configurada' });
            }

            let rawLeads = [];
            if (form_id) {
                rawLeads = await metaService.getFormLeads(form_id, limit);
            } else if (page_id) {
                rawLeads = await metaService.getAllPageLeads(page_id, limit);
            } else {
                return res.status(400).json({ error: 'Informe page_id ou form_id' });
            }

            const leadsByDate = {};
            const totalStats = { found: rawLeads.length, new: 0, exists: 0 };

            // Sort leads by date desc
            rawLeads.sort((a, b) => new Date(b.created_time) - new Date(a.created_time));

            for (const rawLead of rawLeads) {
                const leadgenId = rawLead.id;
                const createdDate = new Date(rawLead.created_time).toISOString().split('T')[0];

                // Check existence
                const existing = await Lead.findOne({ where: { meta_leadgen_id: leadgenId } });
                const status = existing ? 'exists' : 'new';

                if (status === 'new') totalStats.new++;
                else totalStats.exists++;

                if (!leadsByDate[createdDate]) {
                    leadsByDate[createdDate] = [];
                }

                leadsByDate[createdDate].push({
                    id: leadgenId,
                    created_time: rawLead.created_time,
                    status: status,
                    ad_id: rawLead.ad_id
                    // We don't fetch name/phone here to be fast
                });
            }

            res.json({
                status: 'success',
                stats: totalStats,
                grouped_leads: leadsByDate
            });

        } catch (error) {
            console.error('[Preview] Error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * POST /webhook/meta/sync
     * Manually sync/import leads from Meta (backfill) - USES MESSAGE QUEUE
     */
    async syncMetaLeads(req, res) {
        try {
            const { page_id, form_id, limit = 100, selected_ids } = req.body;
            const metaService = require('../../services/MetaService');
            const messageQueue = require('../../services/MessageQueueService');

            if (!metaService.isConfigured()) {
                return res.status(400).json({
                    error: 'Meta API não configurada. Configure META_PAGE_ACCESS_TOKEN no .env'
                });
            }

            console.log('\n📦 [Sync] INICIANDO SINCRONIZAÇÃO DE LEADS META');
            console.log('═'.repeat(50));

            let rawLeads = [];

            if (form_id) {
                rawLeads = await metaService.getFormLeads(form_id, limit);
            } else if (page_id) {
                rawLeads = await metaService.getAllPageLeads(page_id, limit);
            } else {
                return res.status(400).json({
                    error: 'Informe page_id ou form_id'
                });
            }

            // Filter by selected_ids if provided
            if (selected_ids && Array.isArray(selected_ids) && selected_ids.length > 0) {
                console.log(`[Sync] 🎯 Filtrando por ${selected_ids.length} IDs selecionados`);
                rawLeads = rawLeads.filter(lead => selected_ids.includes(lead.id));
            }

            console.log(`[Sync] 📋 ${rawLeads.length} leads para processar`);

            let imported_count = 0;
            let skipped_count = 0;
            let queued_count = 0;
            const queueTasks = [];

            for (const rawLead of rawLeads) {
                try {
                    const leadgenId = rawLead.id;

                    // Check if lead already exists by leadgen_id
                    const existingByLeadgen = await Lead.findOne({
                        where: { meta_leadgen_id: leadgenId },
                        include: [{ model: Pipeline, as: 'pipeline' }]
                    });

                    if (existingByLeadgen) {
                        skipped_count++;
                        continue;
                    }

                    // Get lead data (quick - just name/phone)
                    const leadData = await metaService.getLeadData(leadgenId);
                    const fields = metaService.parseFieldData(leadData.field_data || []);

                    const phone = fields.phone;
                    const name = fields.name || 'Meta Lead';

                    if (!phone) {
                        console.log(`[Sync] ⚠️ Lead ${leadgenId} sem telefone - ignorado`);
                        skipped_count++;
                        continue;
                    }

                    // Check if lead exists by phone
                    const existingByPhone = await leadService.findByPhone(phone);
                    if (existingByPhone) {
                        existingByPhone.meta_leadgen_id = leadgenId;
                        existingByPhone.source = 'meta_ads';
                        await existingByPhone.save();
                        skipped_count++;
                        continue;
                    }

                    // Find pipeline
                    let targetPipeline = await Pipeline.findOne({ where: { title: 'Primeiro Contato' } });
                    if (!targetPipeline) {
                        targetPipeline = await Pipeline.findOne({ order: [['order_index', 'ASC']] });
                    }

                    // CREATE LEAD (but don't send message yet - add to queue)
                    const lead = await Lead.create({
                        name: name,
                        phone: phone,
                        source: 'meta_ads',
                        meta_leadgen_id: leadgenId,
                        pipeline_id: targetPipeline?.id || null,
                        last_interaction_at: new Date(),
                    });

                    console.log(`[Sync] ✅ Lead criado: ${lead.name} (${lead.phone})`);
                    imported_count++;

                    // Add to queue for AI greeting (will be sent with delay)
                    queueTasks.push({
                        type: 'ai_greeting',
                        phone: lead.phone,
                        leadId: lead.id,
                        leadName: lead.name,
                    });

                    // Enrich campaign data in background
                    this.enrichMetaLeadCampaignData(lead, leadgenId, rawLead.ad_id).catch(() => { });

                } catch (err) {
                    console.error(`[Sync] ❌ Erro no lead ${rawLead.id}:`, err.message);
                }
            }

            // Add all tasks to queue (will be processed with 30-60s delay between each)
            if (queueTasks.length > 0) {
                queued_count = messageQueue.addBulkToQueue(queueTasks);
                const queueStatus = messageQueue.getStatus();

                console.log(`\n[Sync] 📬 ${queued_count} mensagens adicionadas à fila`);
                console.log(`[Sync] ⏱️ Tempo estimado: ~${queueStatus.estimatedTimeMinutes} minutos`);
            }

            console.log('═'.repeat(50));
            console.log(`[Sync] 📊 RESUMO: ${imported_count} importados, ${skipped_count} ignorados, ${queued_count} na fila`);
            console.log('═'.repeat(50) + '\n');

            res.json({
                status: 'success',
                imported_count,
                skipped_count,
                queued_for_message: queued_count,
                total_found: rawLeads.length,
                queue_status: messageQueue.getStatus(),
                message: queued_count > 0
                    ? `${queued_count} leads serão contatados com intervalo de 30-60s para proteger o chip.`
                    : 'Nenhum novo lead para contatar.',
            });

        } catch (error) {
            console.error('[Sync] ❌ Erro geral:', error.message);
            res.status(500).json({
                error: 'Erro ao sincronizar leads do Meta',
                details: error.message
            });
        }
    }
}

module.exports = new WebhookController();
