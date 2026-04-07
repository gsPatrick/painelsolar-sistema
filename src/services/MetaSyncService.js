const { Lead, Pipeline, Message, SyncLog } = require('../models');
const metaService = require('./MetaService');
const openAIService = require('./OpenAIService');
const whatsAppService = require('./WhatsAppService');
const { Op } = require('sequelize');

class MetaSyncService {
    constructor() {
        // No longer using a single hardcoded PAGE_ID
    }

    /**
     * Run the synchronization job
     * Fetches leads from last 2 days for ALL accessible pages
     */
    async runSyncJob() {
        console.log(`[MetaSync] [${new Date().toISOString()}] Starting Dynamic Meta Lead Sync Job...`);

        if (!metaService.isConfigured()) {
            console.error('[MetaSync] Meta API not configured (META_PAGE_ACCESS_TOKEN missing). Skipping.');
            return;
        }

        const token = metaService.accessToken;
        const maskedToken = token ? `${token.substring(0, 10)}...${token.substring(token.length - 5)}` : 'MISSING';
        
        let syncLog = await SyncLog.create({
            status: 'running',
            message: `Iniciando sincronização dinâmica (Token: ${maskedToken})...`,
            startedAt: new Date()
        });

        try {
            // 1. Fetch ALL pages accessible by this token
            const pages = await metaService.getAvailablePages();
            
            if (pages.length === 0) {
                console.log('[MetaSync] No pages found for this token.');
                await syncLog.update({
                    status: 'success',
                    message: 'Nenhuma página encontrada para este token.',
                    finishedAt: new Date()
                });
                return;
            }

            let totalAdded = 0;
            let totalExisting = 0;
            let totalAnalyzed = 0;
            let pagesProcessed = 0;

            // 2. Iterate through each page
            for (const page of pages) {
                console.log(`\n[MetaSync] 📄 Syncing Page: ${page.name} (ID: ${page.id})`);
                
                try {
                    // Fetch leads from Meta for this specific page
                    const metaLeads = await metaService.getAllPageLeads(page.id, 100);
                    
                    if (!metaLeads || metaLeads.length === 0) {
                        console.log(`[MetaSync] - No leads found for page ${page.name}.`);
                        pagesProcessed++;
                        continue;
                    }

                    // Define Time Range: "Today" and "Yesterday"
                    const startTime = new Date();
                    startTime.setHours(startTime.getHours() - 48);

                    const recentMetaLeads = metaLeads.filter(l => {
                        const created = new Date(l.created_time);
                        return created >= startTime;
                    });

                    console.log(`[MetaSync] - Found ${recentMetaLeads.length} recent leads (last 48h) out of ${metaLeads.length} total fetched for this page.`);

                    for (const rawLead of recentMetaLeads) {
                        totalAnalyzed++;
                        const leadgenId = rawLead.id;

                        // Check for duplicates
                        const existing = await Lead.findOne({ where: { meta_leadgen_id: leadgenId } });
                        if (existing) {
                            totalExisting++;
                            continue;
                        }

                        // Create proper Lead
                        console.log(`[MetaSync] -- Processing new lead from ${page.name}: ${leadgenId}`);
                        const result = await this.processNewLead(leadgenId);
                        if (result) totalAdded++;
                    }
                    
                    pagesProcessed++;
                } catch (pageError) {
                    console.error(`[MetaSync] ❌ Error syncing page ${page.name} (${page.id}):`, pageError.message);
                }
            }

            console.log(`\n[MetaSync] Job Finished. Pages: ${pagesProcessed}, New: ${totalAdded}, Analyzed: ${totalAnalyzed}.`);

            // Finalize SyncLog
            await syncLog.update({
                status: 'success',
                message: `Sincronização concluída para ${pagesProcessed} páginas. ${totalAdded} novos leads adicionados.`,
                leads_found: totalAnalyzed,
                leads_added: totalAdded,
                finishedAt: new Date()
            });

        } catch (error) {
            console.error('[MetaSync] ❌ CRITICAL ERROR in Sync Job:', error.message);
            if (syncLog) {
                await syncLog.update({
                    status: 'error',
                    message: `Erro crítico na sincronização: ${error.message}`,
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
            console.log(`[MetaSync] Generating initial greeting for lead ${lead.id} (${lead.phone})...`);
            
            // Generate Hello
            const aiResponse = await openAIService.generateResponse([], {
                name: lead.name,
                phone: lead.phone,
                source: lead.source,
                pipeline_title: 'Entrada'
            }, null, lead.id);

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
                console.log(`[MetaSync] Sending WhatsApp greeting to ${lead.phone}...`);
                const waResult = await whatsAppService.sendMessage(lead.phone, responseText, 5);
                
                if (waResult.success) {
                    console.log(`[MetaSync] ✅ Greeting sent successfully to ${lead.phone}`);
                } else {
                    console.error(`[MetaSync] ❌ Failed to send WhatsApp greeting to ${lead.phone}:`, waResult.error);
                }
            } else {
                console.warn(`[MetaSync] ⚠️ AI did not generate greeting for ${lead.id}. Success: ${aiResponse.success}, Aborted: ${aiResponse.aborted}, Error: ${aiResponse.error}`);
            }
        } catch (err) {
            console.error(`[MetaSync] ❌ Error sending greeting to ${lead.id}:`, err.message);
        }
    }
}

module.exports = new MetaSyncService();
