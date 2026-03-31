const { Lead, Pipeline, Message, SyncLog } = require('../models');
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
        console.log(`[MetaSync] [${new Date().toISOString()}] Starting Meta Lead Sync Job for Page ${this.PAGE_ID}...`);

        if (!metaService.isConfigured()) {
            console.error('[MetaSync] Meta API not configured (META_PAGE_ACCESS_TOKEN missing). Skipping.');
            return;
        }

        const token = metaService.accessToken;
        const maskedToken = token ? `${token.substring(0, 10)}...${token.substring(token.length - 5)}` : 'MISSING';
        console.log(`[MetaSync] Using token: ${maskedToken} for Page ID: ${this.PAGE_ID}`);

        let syncLog = null;
        try {
            // Initialize SyncLog in DB
            syncLog = await SyncLog.create({
                status: 'running',
                message: `Iniciando sincronização (Token: ${maskedToken})...`,
                startedAt: new Date()
            });

            // 1. Fetch leads from Meta (fetch 100 to be safe for 2 days volume)
            const metaLeads = await metaService.getAllPageLeads(this.PAGE_ID, 100);
            
            if (!metaLeads || metaLeads.length === 0) {
                console.log('[MetaSync] No leads found in any forms for this page.');
                await syncLog.update({
                    status: 'success',
                    message: 'Nenhum lead encontrado nos formulários da página.',
                    finishedAt: new Date()
                });
                return;
            }

            // 2. Define Time Range: "Today" and "Yesterday"
            const startTime = new Date();
            startTime.setHours(startTime.getHours() - 48);

            const recentMetaLeads = metaLeads.filter(l => {
                const created = new Date(l.created_time);
                return created >= startTime;
            });

            console.log(`[MetaSync] Found ${recentMetaLeads.length} recent leads (last 48h) out of ${metaLeads.length} total fetched.`);

            let addedCount = 0;
            let existingCount = 0;

            for (const rawLead of recentMetaLeads) {
                const leadgenId = rawLead.id;

                // 3. Check for duplicates (Idempotency) - Check both meta_id and phone
                const existing = await Lead.findOne({ where: { meta_leadgen_id: leadgenId } });
                if (existing) {
                    existingCount++;
                    continue;
                }

                // 4. Create proper Lead
                console.log(`[MetaSync] Processing new lead from Meta: ${leadgenId}`);
                const result = await this.processNewLead(leadgenId);
                if (result) addedCount++;
            }

            console.log(`[MetaSync] Job Finished. New: ${addedCount}, Already Exists: ${existingCount}.`);

            // Finalize SyncLog
            await syncLog.update({
                status: 'success',
                message: `Sincronização concluída. ${addedCount} novos leads adicionados. ${recentMetaLeads.length} analisados.`,
                leads_found: recentMetaLeads.length,
                leads_added: addedCount,
                finishedAt: new Date()
            });

        } catch (error) {
            console.error('[MetaSync] ❌ CRITICAL ERROR in Sync Job:', error.message);
            if (syncLog) {
                await syncLog.update({
                    status: 'error',
                    message: `Erro na sincronização: ${error.message}`,
                    error_details: error.response ? error.response.data : null,
                    finishedAt: new Date()
                });
            }
        }
    }

    /**
     * Process a single new lead: Fetch details, Create in DB, Send Greeting
     */
    async processNewLead(leadgenId) {
        try {
            const leadData = await metaService.getLeadData(leadgenId);
            
            if (!leadData || !leadData.field_data) {
                console.error(`[MetaSync] Could not fetch details for lead ${leadgenId}`);
                return false;
            }

            const fields = metaService.parseFieldData(leadData.field_data || []);
            const name = fields.name || 'Meta Lead';
            const phone = fields.phone;

            if (!phone) {
                console.warn(`[MetaSync] Lead ${leadgenId} (${name}) has no phone number. Skipping.`);
                return false;
            }

            // Double check by phone to avoid duplicates even if meta_id is missing
            const existingByPhone = await Lead.findOne({ where: { phone: phone } });
            if (existingByPhone) {
                console.log(`[MetaSync] Lead with phone ${phone} already exists in DB. Linking Meta ID ${leadgenId}...`);
                existingByPhone.meta_leadgen_id = leadgenId;
                existingByPhone.source = 'meta_ads'; // Ensure source is correct
                await existingByPhone.save();
                return false;
            }

            // Find Pipeline
            const pipelineId = await this.getEntradaPipelineId();

            // Create Lead
            const lead = await Lead.create({
                name: name,
                phone: phone,
                source: 'meta_ads',
                meta_leadgen_id: leadgenId,
                pipeline_id: pipelineId,
                last_interaction_at: new Date(),
                ai_status: 'active'
            });

            console.log(`[MetaSync] ✅ Lead Created: ${name} (${phone}) - ID: ${lead.id}`);

            // 5. Send Initial AI Greeting
            await this.sendGreeting(lead);
            return true;

        } catch (err) {
            console.error(`[MetaSync] ❌ Error processing lead ${leadgenId}:`, err.message);
            return false;
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
