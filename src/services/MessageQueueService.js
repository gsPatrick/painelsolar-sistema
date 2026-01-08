/**
 * MESSAGE QUEUE SERVICE
 * Prevents WhatsApp chip blocking by spacing out messages
 * 
 * Features:
 * - Queue-based message sending
 * - Configurable delay between messages (default: 30-60 seconds random)
 * - Batch size limits
 * - Safe mode for bulk operations
 */

class MessageQueueService {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
        this.minDelayMs = 30000;  // 30 seconds minimum
        this.maxDelayMs = 60000;  // 60 seconds maximum
        this.dailyLimit = 100;    // Max messages per day for safety
        this.sentToday = 0;
        this.lastResetDate = new Date().toDateString();

        console.log('[MessageQueue] Initialized - Delay: 30-60s, Daily limit: 100');
    }

    /**
     * Get random delay between min and max
     */
    getRandomDelay() {
        return Math.floor(Math.random() * (this.maxDelayMs - this.minDelayMs + 1)) + this.minDelayMs;
    }

    /**
     * Reset daily counter if new day
     */
    checkDailyReset() {
        const today = new Date().toDateString();
        if (today !== this.lastResetDate) {
            this.sentToday = 0;
            this.lastResetDate = today;
            console.log('[MessageQueue] Daily counter reset');
        }
    }

    /**
     * Add message to queue
     * @param {Object} task - { type: 'message'|'ai_greeting', phone, message, leadId, leadName }
     */
    addToQueue(task) {
        this.checkDailyReset();

        if (this.sentToday >= this.dailyLimit) {
            console.warn(`[MessageQueue] ⚠️ Daily limit reached (${this.dailyLimit}). Task not added.`);
            return false;
        }

        this.queue.push({
            ...task,
            addedAt: new Date(),
            status: 'pending'
        });

        console.log(`[MessageQueue] 📥 Task added: ${task.type} for ${task.phone} (Queue: ${this.queue.length})`);

        // Start processing if not already running
        if (!this.isProcessing) {
            this.processQueue();
        }

        return true;
    }

    /**
     * Add bulk tasks (for sync operations)
     * Returns number of tasks added
     */
    addBulkToQueue(tasks) {
        let added = 0;
        for (const task of tasks) {
            if (this.addToQueue(task)) {
                added++;
            }
        }
        console.log(`[MessageQueue] 📦 Bulk add: ${added}/${tasks.length} tasks added to queue`);
        return added;
    }

    /**
     * Process queue with delay between messages
     */
    async processQueue() {
        if (this.isProcessing || this.queue.length === 0) {
            return;
        }

        this.isProcessing = true;
        console.log(`[MessageQueue] 🚀 Starting queue processing (${this.queue.length} tasks)`);

        const whatsAppService = require('./WhatsAppService');
        const openAIService = require('./OpenAIService');
        const { Message, Lead } = require('../models');

        while (this.queue.length > 0) {
            const task = this.queue.shift();

            try {
                console.log(`\n[MessageQueue] 📤 Processing: ${task.type} for ${task.phone}`);

                if (task.type === 'ai_greeting') {
                    // Generate AI response
                    const aiResponse = await openAIService.generateResponse([], {
                        name: task.leadName || 'Cliente',
                        phone: task.phone,
                    });

                    if (aiResponse.success && aiResponse.message) {
                        let responseText = aiResponse.message;

                        // Remove video tag if present (handle separately)
                        if (responseText.includes('[ENVIAR_VIDEO_PROVA_SOCIAL]')) {
                            responseText = responseText.replace('[ENVIAR_VIDEO_PROVA_SOCIAL]', '').trim();
                        }

                        // Save message
                        await Message.create({
                            lead_id: task.leadId,
                            content: responseText,
                            sender: 'ai',
                            timestamp: new Date(),
                        });

                        // Send via WhatsApp
                        await whatsAppService.sendMessage(task.phone, responseText, 2);
                        console.log(`[MessageQueue] ✅ AI greeting sent to ${task.phone}`);

                        this.sentToday++;
                    }

                } else if (task.type === 'message') {
                    // Simple message
                    await whatsAppService.sendMessage(task.phone, task.message, 2);
                    console.log(`[MessageQueue] ✅ Message sent to ${task.phone}`);
                    this.sentToday++;
                }

                // Update lead last interaction
                if (task.leadId) {
                    await Lead.update(
                        { last_interaction_at: new Date() },
                        { where: { id: task.leadId } }
                    );
                }

            } catch (error) {
                console.error(`[MessageQueue] ❌ Error processing task for ${task.phone}:`, error.message);
            }

            // Wait before next message (CRITICAL for anti-block)
            if (this.queue.length > 0) {
                const delay = this.getRandomDelay();
                console.log(`[MessageQueue] ⏳ Waiting ${Math.round(delay / 1000)}s before next message... (${this.queue.length} remaining)`);
                await this.sleep(delay);
            }
        }

        this.isProcessing = false;
        console.log(`[MessageQueue] ✅ Queue processing complete. Sent today: ${this.sentToday}/${this.dailyLimit}`);
    }

    /**
     * Get queue status
     */
    getStatus() {
        return {
            queueLength: this.queue.length,
            isProcessing: this.isProcessing,
            sentToday: this.sentToday,
            dailyLimit: this.dailyLimit,
            remainingToday: this.dailyLimit - this.sentToday,
            estimatedTimeMinutes: Math.round((this.queue.length * 45) / 60), // Avg 45s per msg
        };
    }

    /**
     * Clear queue (emergency stop)
     */
    clearQueue() {
        const cleared = this.queue.length;
        this.queue = [];
        console.log(`[MessageQueue] 🛑 Queue cleared: ${cleared} tasks removed`);
        return cleared;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = new MessageQueueService();
