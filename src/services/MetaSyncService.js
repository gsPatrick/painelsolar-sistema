
const { Lead, Pipeline, Message } = require('../models');
const metaService = require('./MetaService');
const openAIService = require('./OpenAIService');
const whatsAppService = require('./WhatsAppService');
const { Op } = require('sequelize');

class MetaSyncService {
    constructor() {
        this.PAGE_ID = '534745156397254'; // Ensure this Page ID is correct dynamically or via env if possible
    }

    /**
     * Run the synchronization job
     * Fetches leads from last 2 days (Today and Yesterday)
     */
    async runSyncJob() {
        console.log('[MetaSync] Starting Meta Lead Sync Job...');

        if (!metaService.isConfigured()) {
            console.error('[MetaSync] Meta API not configured. Skipping.');
            return;
        }

        try {
            // 1. Fetch leads from Meta (fetch 100 to be safe for 2 days volume)
            // We fetch slightly more to ensure coverage
            const metaLeads = await metaService.getAllPageLeads(this.PAGE_ID, 100);

            // 2. Define Time Range: "Today" and "Yesterday"
            // We'll just look back 48 hours from NOW to be simple and robust against timezones
            const startTime = new Date();
            startTime.setHours(startTime.getHours() - 48);

            const recentMetaLeads = metaLeads.filter(l => {
                const created = new Date(l.created_time);
                return created >= startTime;
            });

            console.log(`[MetaSync] Found ${recentMetaLeads.length} leads from last 48h.`);

            let addedCount = 0;

            for (const rawLead of recentMetaLeads) {
                const leadgenId = rawLead.id;

                // 3. Check for duplicates (Idempotency)
                const existing = await Lead.findOne({ where: { meta_leadgen_id: leadgenId } });
                if (existing) continue;

                // 4. Create proper Lead
                console.log(`[MetaSync] New lead found: ${leadgenId}. Fetching details...`);
                await this.processNewLead(leadgenId);
                addedCount++;
            }

            console.log(`[MetaSync] Job Complete. Added ${addedCount} new leads.`);

        } catch (error) {
            console.error('[MetaSync] Error in Sync Job:', error.message);
        }
    }

    /**
     * Process a single new lead: Fetch details, Create in DB, Send Greeting
     */
    async processNewLead(leadgenId) {
        try {
            const leadData = await metaService.getLeadData(leadgenId);
            const fields = metaService.parseFieldData(leadData.field_data || []);
            const name = fields.name || 'Meta Lead';
            const phone = fields.phone;

            if (!phone) {
                console.warn(`[MetaSync] Lead ${leadgenId} has no phone. Skipping.`);
                return;
            }

            // Double check by phone
            const existingByPhone = await Lead.findOne({ where: { phone: phone } });
            if (existingByPhone) {
                console.log(`[MetaSync] Lead phone ${phone} already exists. Linking ID.`);
                existingByPhone.meta_leadgen_id = leadgenId;
                await existingByPhone.save();
                return;
            }

            // Create Lead
            const lead = await Lead.create({
                name: name,
                phone: phone,
                source: 'meta_ads',
                meta_leadgen_id: leadgenId,
                pipeline_id: await this.getEntradaPipelineId(),
                last_interaction_at: new Date()
            });

            console.log(`[MetaSync] Lead Created: ${name} (${phone})`);

            // 5. Send Initial AI Greeting
            await this.sendGreeting(lead);

        } catch (err) {
            console.error(`[MetaSync] Error processing lead ${leadgenId}:`, err.message);
        }
    }

    async getEntradaPipelineId() {
        const p = await Pipeline.findOne({ where: { title: 'Entrada' } });
        return p ? p.id : null;
    }

    /**
     * Send the AI Greeting Message
     */
    async sendGreeting(lead) {
        try {
            // Generate Hello
            const aiResponse = await openAIService.generateResponse([], {
                name: lead.name,
                phone: lead.phone,
                pipeline_title: 'Entrada'
            });

            if (aiResponse.success && aiResponse.message) {
                const responseText = aiResponse.message;

                // Save message
                await Message.create({
                    lead_id: lead.id,
                    content: responseText,
                    sender: 'ai',
                    timestamp: new Date(),
                });

                // Send WhatsApp (with safety delay)
                await whatsAppService.sendMessage(lead.phone, responseText, 5);
                console.log(`[MetaSync] Greeting sent to ${lead.phone}`);
            }
        } catch (err) {
            console.error(`[MetaSync] Error sending greeting to ${lead.id}:`, err.message);
        }
    }
}

module.exports = new MetaSyncService();
