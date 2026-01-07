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
            // The frontend sends 'user' for some reason, but we should distinguish
            // Assuming if we hit this API, it's NOT the lead (who sends via webhook) and NOT the AI (service internal)
            // But let's respect the 'sender' param if passed, defaulting to 'agent' if not 'ai'

            const isManualMessage = sender !== 'ai' && sender !== 'user';
            // NOTE: The frontend currently sends 'user', which is confusing. 
            // We'll trust the caller. If specific sender 'agent' is passed, treat as manual.
            // However, to fix the IMMEDIATE issue where frontend sends 'user' but means 'operator':
            // We need to clarify. 
            // Let's assume if this endpoint is called, it IS an outgoing message from the system/agent, 
            // UNLESS it's specifically marked as 'ai' (internally) or 'user' (webhook).
            // But webhook uses findByPhone, not this endpoint.
            // So this endpoint is primarily for Dashboard/Agent usage.

            // Let's force sender to 'agent' if it comes from the dashboard (req.user exists)
            const finalSender = req.user ? 'agent' : (sender || 'agent');

            // 3. Send via WhatsApp (if not internal note/AI)
            const whatsAppService = require('../../services/WhatsAppService');

            if (finalSender === 'agent') {
                // Send with typing delay (e.g. 2s)
                await whatsAppService.sendMessage(lead.phone, content, 2);

                // 4. PAUSE AI (Human Intervention)
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
                } else {
                    console.log(`[MessageController] AI already paused for lead ${lead.id}`);
                }
            }

            // 5. Save to DB
            const message = await messageService.create({
                lead_id,
                content,
                sender: finalSender, // Store as 'agent' for correct UI styling (needs frontend update too)
                timestamp: new Date()
            });

            res.status(201).json(message);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to save message' });
        }
    }
};

module.exports = messageController;
