const EventEmitter = require('events');
const { SystemSettings, Message, Lead } = require('../models');
const whatsAppService = require('./WhatsAppService');
const messageService = require('../features/message/message.service');

// Singleton to hold job state
class BulkSenderService extends EventEmitter {
    constructor() {
        super();
        this.currentJob = null; // { id, total, current, success, failed, status: 'idle'|'running'|'completed'|'stopped', leads: [], content: '', minDelay, maxDelay }
        this.io = null; // Socket.io instance
    }

    setSocket(io) {
        this.io = io;
    }

    getStatus() {
        return this.currentJob || { status: 'idle' };
    }

    async startBulkSend(leadIds, content, options = {}) {
        if (this.currentJob && this.currentJob.status === 'running') {
            throw new Error('Já existe um disparo em andamento.');
        }

        const { minDelay = 15, maxDelay = 30 } = options;

        this.currentJob = {
            id: Date.now().toString(),
            total: leadIds.length,
            current: 0,
            success: 0,
            failed: 0,
            status: 'running',
            leads: leadIds, // Array of IDs
            content,
            minDelay,
            maxDelay,
            startTime: new Date()
        };

        this._broadcastProgress();

        // Start processing in background (don't await)
        this._processQueue();

        return this.currentJob;
    }

    stopCurrentJob() {
        if (this.currentJob && this.currentJob.status === 'running') {
            this.currentJob.status = 'stopped';
            this._broadcastProgress();
            return true;
        }
        return false;
    }

    async _processQueue() {
        if (!this.currentJob) return;

        const { leads, content, minDelay, maxDelay } = this.currentJob;

        console.log(`[BulkSender] Starting job ${this.currentJob.id} for ${leads.length} leads.`);

        for (let i = 0; i < leads.length; i++) {
            // Check if stopped
            if (this.currentJob.status === 'stopped') {
                console.log('[BulkSender] Job stopped by user.');
                break;
            }

            const leadId = leads[i];
            this.currentJob.current = i + 1;

            try {
                const lead = await Lead.findByPk(leadId);

                if (lead) {
                    // Personalize
                    const firstName = lead.name ? lead.name.split(' ')[0] : 'Cliente';
                    const personalizedContent = content.replace(/{nome}/gi, firstName);

                    // Send
                    await whatsAppService.sendMessage(lead.phone, personalizedContent, 0);

                    // Save Message
                    await messageService.create({
                        lead_id: lead.id,
                        content: personalizedContent,
                        sender: 'ai', // Mark as AI/Bot
                        timestamp: new Date()
                    });

                    // Pause AI
                    if (lead.ai_status !== 'human_intervention') {
                        lead.ai_status = 'human_intervention';
                        lead.ai_paused_at = new Date();
                        await lead.save();
                    }

                    this.currentJob.success++;
                } else {
                    this.currentJob.failed++;
                }

            } catch (error) {
                console.error(`[BulkSender] Error sending to lead ${leadId}:`, error.message);
                this.currentJob.failed++;
            }

            this._broadcastProgress();

            // Wait Delay (if not last)
            if (i < leads.length - 1) {
                const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1) + minDelay) * 1000;
                console.log(`[BulkSender] Waiting ${delay / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        if (this.currentJob.status !== 'stopped') {
            this.currentJob.status = 'completed';
        }
        this._broadcastProgress();
        console.log('[BulkSender] Job finished/stopped.');
    }

    _broadcastProgress() {
        if (this.io && this.currentJob) {
            this.io.emit('bulk_progress', this.currentJob);
        }
    }
}

module.exports = new BulkSenderService();
