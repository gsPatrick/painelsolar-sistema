const axios = require('axios');
const env = require('../config/env');

/**
 * WhatsApp Service - Z-API Integration
 * Based on official Z-API documentation
 */
class WhatsAppService {
    constructor() {
        this.baseUrl = env.ZAPI_BASE_URL;
        this.instanceId = env.ZAPI_INSTANCE_ID;
        this.token = env.ZAPI_TOKEN;
        this.clientToken = env.ZAPI_CLIENT_TOKEN;
        this.headers = {
            'Content-Type': 'application/json',
            'Client-Token': this.clientToken
        };
    }

    /**
     * Get the full API URL for Z-API endpoints
     */
    getApiUrl(endpoint) {
        return `${this.baseUrl}/instances/${this.instanceId}/token/${this.token}/${endpoint}`;
    }

    /**
     * Check if Z-API is configured
     */
    isConfigured() {
        return !!(this.instanceId && this.token);
    }

    // ===========================================
    // CONNECTION & STATUS
    // ===========================================

    /**
     * Get QR Code for authentication
     */
    async getQRCode() {
        try {
            if (!this.isConfigured()) {
                return { success: false, error: 'Z-API not configured' };
            }
            const url = this.getApiUrl('qrcode');
            const response = await axios.get(url, { headers: this.headers });
            return { success: true, data: response.data };
        } catch (error) {
            console.error('[WhatsAppService] Error getting QR Code:', error.response?.data || error.message);
            return { success: false, error: error.response?.data || error.message };
        }
    }

    /**
     * Check connection status
     */
    async checkStatus() {
        try {
            if (!this.isConfigured()) {
                return { connected: false, error: 'Z-API not configured' };
            }
            const url = this.getApiUrl('status');
            const response = await axios.get(url, { headers: this.headers });
            return {
                connected: response.data?.connected || false,
                session: response.data?.session,
                smartphoneConnected: response.data?.smartphoneConnected,
                data: response.data,
            };
        } catch (error) {
            console.error('[WhatsAppService] Error checking status:', error.response?.data || error.message);
            return { connected: false, error: error.response?.data || error.message };
        }
    }

    /**
     * Get device information
     */
    async getDeviceInfo() {
        try {
            if (!this.isConfigured()) {
                return { success: false, error: 'Z-API not configured' };
            }
            const url = this.getApiUrl('device');
            const response = await axios.get(url, { headers: this.headers });
            return { success: true, data: response.data };
        } catch (error) {
            console.error('[WhatsAppService] Error getting device info:', error.response?.data || error.message);
            return { success: false, error: error.response?.data || error.message };
        }
    }

    /**
     * Disconnect instance
     */
    async disconnect() {
        try {
            if (!this.isConfigured()) {
                return { success: false, error: 'Z-API not configured' };
            }
            const url = this.getApiUrl('disconnect');
            const response = await axios.get(url, { headers: this.headers });
            return { success: true, data: response.data };
        } catch (error) {
            console.error('[WhatsAppService] Error disconnecting:', error.response?.data || error.message);
            return { success: false, error: error.response?.data || error.message };
        }
    }

    /**
     * Restart instance
     */
    async restart() {
        try {
            if (!this.isConfigured()) {
                return { success: false, error: 'Z-API not configured' };
            }
            const url = this.getApiUrl('restart');
            const response = await axios.get(url, { headers: this.headers });
            return { success: true, data: response.data };
        } catch (error) {
            console.error('[WhatsAppService] Error restarting:', error.response?.data || error.message);
            return { success: false, error: error.response?.data || error.message };
        }
    }

    // ===========================================
    // SEND MESSAGES
    // ===========================================

    /**
     * Send text message
     * @param {string} phone - Phone number (e.g., 5511999999999)
     * @param {string} message - Text message
     * @param {object} options - Optional: { messageId, delayTyping, delayMessage }
     */
    async sendText(phone, message, options = {}) {
        try {
            if (!this.isConfigured()) {
                console.warn('[WhatsAppService] Z-API not configured. Message not sent.');
                return { success: false, error: 'Z-API not configured' };
            }

            const url = this.getApiUrl('send-text');
            // Ensure message is a string
            let finalMessage = String(message || '');

            // Fix common formatting issues:
            // Fix common formatting issues:
            // 1. Replace literal "\r\n", "\r", "\n" (escaped) with actual newlines
            finalMessage = finalMessage
                .replace(/\\r\\n/g, '\n')
                .replace(/\\r/g, '\n')
                .replace(/\\n/g, '\n');

            // 2. Trim start/end whitespace
            finalMessage = finalMessage.trim();

            const data = {
                phone: phone.replace(/\D/g, ''),
                message: finalMessage,
            };

            // Add optional parameters
            if (options.messageId) {
                data.messageId = options.messageId;
            }
            if (options.delayTyping) {
                data.delayTyping = options.delayTyping; // Simulates "typing..." status
            }
            if (options.delayMessage) {
                data.delayMessage = options.delayMessage;
            }

            const response = await axios.post(url, data, { headers: this.headers });
            console.log(`[WhatsAppService] Text sent to ${phone}`);
            return { success: true, data: response.data };
        } catch (error) {
            console.error('[WhatsAppService] Error sending text:', error.response?.data || error.message);
            return { success: false, error: error.response?.data || error.message };
        }
    }

    // Alias for sendText with default typing delay for human-like feel
    async sendMessage(phone, message, delayTyping = 3) {
        return this.sendText(phone, message, { delayTyping });
    }

    /**
     * Send image
     * @param {string} phone - Phone number
     * @param {string} imageUrl - URL of the image
     * @param {string} caption - Optional caption
     */
    async sendImage(phone, imageUrl, caption = '') {
        try {
            if (!this.isConfigured()) {
                return { success: false, error: 'Z-API not configured' };
            }

            const url = this.getApiUrl('send-image');
            const data = {
                phone: phone.replace(/\D/g, ''),
                image: imageUrl,
                caption,
            };

            const response = await axios.post(url, data, { headers: this.headers });
            console.log(`[WhatsAppService] Image sent to ${phone}`);
            return { success: true, data: response.data };
        } catch (error) {
            console.error('[WhatsAppService] Error sending image:', error.response?.data || error.message);
            return { success: false, error: error.response?.data || error.message };
        }
    }

    /**
     * Send audio
     * @param {string} phone - Phone number
     * @param {string} audioUrl - URL of the audio file
     */
    async sendAudio(phone, audioUrl) {
        try {
            if (!this.isConfigured()) {
                return { success: false, error: 'Z-API not configured' };
            }

            const url = this.getApiUrl('send-audio');
            const data = {
                phone: phone.replace(/\D/g, ''),
                audio: audioUrl,
            };

            const response = await axios.post(url, data, { headers: this.headers });
            console.log(`[WhatsAppService] Audio sent to ${phone}`);
            return { success: true, data: response.data };
        } catch (error) {
            console.error('[WhatsAppService] Error sending audio:', error.response?.data || error.message);
            return { success: false, error: error.response?.data || error.message };
        }
    }

    /**
     * Send video
     * @param {string} phone - Phone number
     * @param {string} videoUrl - URL of the video
     * @param {string} caption - Optional caption
     * @param {object} options - Optional: { delayTyping, delayMessage }
     */
    async sendVideo(phone, videoUrl, caption = '', options = {}) {
        try {
            if (!this.isConfigured()) {
                return { success: false, error: 'Z-API not configured' };
            }

            const url = this.getApiUrl('send-video');
            const data = {
                phone: phone.replace(/\D/g, ''),
                video: videoUrl,
                caption,
            };

            if (options.delayTyping) {
                data.delayTyping = options.delayTyping;
            }
            if (options.delayMessage) {
                data.delayMessage = options.delayMessage;
            }

            const response = await axios.post(url, data, { headers: this.headers });
            console.log(`[WhatsAppService] Video sent to ${phone}`);
            return { success: true, data: response.data };
        } catch (error) {
            console.error('[WhatsAppService] Error sending video:', error.response?.data || error.message);
            return { success: false, error: error.response?.data || error.message };
        }
    }

    /**
     * Send document
     * @param {string} phone - Phone number
     * @param {string} documentUrl - URL of the document
     * @param {string} fileName - File name (e.g., "document.pdf")
     */
    async sendDocument(phone, documentUrl, fileName) {
        try {
            if (!this.isConfigured()) {
                return { success: false, error: 'Z-API not configured' };
            }

            const url = this.getApiUrl('send-document');
            const data = {
                phone: phone.replace(/\D/g, ''),
                document: documentUrl,
                fileName,
            };

            const response = await axios.post(url, data, { headers: this.headers });
            console.log(`[WhatsAppService] Document sent to ${phone}`);
            return { success: true, data: response.data };
        } catch (error) {
            console.error('[WhatsAppService] Error sending document:', error.response?.data || error.message);
            return { success: false, error: error.response?.data || error.message };
        }
    }

    /**
     * Send location
     * @param {string} phone - Phone number
     * @param {number} latitude - Latitude
     * @param {number} longitude - Longitude
     * @param {string} name - Location name
     * @param {string} address - Address
     */
    async sendLocation(phone, latitude, longitude, name = '', address = '') {
        try {
            if (!this.isConfigured()) {
                return { success: false, error: 'Z-API not configured' };
            }

            const url = this.getApiUrl('send-location');
            const data = {
                phone: phone.replace(/\D/g, ''),
                latitude,
                longitude,
                name,
                address,
            };

            const response = await axios.post(url, data, { headers: this.headers });
            console.log(`[WhatsAppService] Location sent to ${phone}`);
            return { success: true, data: response.data };
        } catch (error) {
            console.error('[WhatsAppService] Error sending location:', error.response?.data || error.message);
            return { success: false, error: error.response?.data || error.message };
        }
    }

    /**
     * Send contact
     * @param {string} phone - Phone number
     * @param {string} contactPhone - Contact phone to send
     * @param {string} contactName - Contact name
     */
    async sendContact(phone, contactPhone, contactName) {
        try {
            if (!this.isConfigured()) {
                return { success: false, error: 'Z-API not configured' };
            }

            const url = this.getApiUrl('send-contact');
            const data = {
                phone: phone.replace(/\D/g, ''),
                contactPhone: [contactPhone],
                contactName: [contactName],
            };

            const response = await axios.post(url, data, { headers: this.headers });
            console.log(`[WhatsAppService] Contact sent to ${phone}`);
            return { success: true, data: response.data };
        } catch (error) {
            console.error('[WhatsAppService] Error sending contact:', error.response?.data || error.message);
            return { success: false, error: error.response?.data || error.message };
        }
    }

    /**
     * Send button actions
     * @param {string} phone - Phone number
     * @param {string} message - Message text
     * @param {Array} buttons - Array of button objects
     */
    async sendButtonActions(phone, message, buttons) {
        try {
            if (!this.isConfigured()) {
                return { success: false, error: 'Z-API not configured' };
            }

            const url = this.getApiUrl('send-button-actions');
            const data = {
                phone: phone.replace(/\D/g, ''),
                message,
                buttonActions: buttons,
            };

            const response = await axios.post(url, data, { headers: this.headers });
            console.log(`[WhatsAppService] Buttons sent to ${phone}`);
            return { success: true, data: response.data };
        } catch (error) {
            console.error('[WhatsAppService] Error sending buttons:', error.response?.data || error.message);
            return { success: false, error: error.response?.data || error.message };
        }
    }

    /**
     * Send option list
     * @param {string} phone - Phone number
     * @param {string} message - Message text
     * @param {string} title - List title
     * @param {Array} options - Array of options
     */
    async sendOptionList(phone, message, title, options) {
        try {
            if (!this.isConfigured()) {
                return { success: false, error: 'Z-API not configured' };
            }

            const url = this.getApiUrl('send-option-list');
            const data = {
                phone: phone.replace(/\D/g, ''),
                message,
                optionList: {
                    title,
                    buttonLabel: 'Ver opções',
                    options,
                },
            };

            const response = await axios.post(url, data, { headers: this.headers });
            console.log(`[WhatsAppService] Option list sent to ${phone}`);
            return { success: true, data: response.data };
        } catch (error) {
            console.error('[WhatsAppService] Error sending option list:', error.response?.data || error.message);
            return { success: false, error: error.response?.data || error.message };
        }
    }

    /**
     * Delete message
     * @param {string} phone - Phone number
     * @param {string} messageId - Message ID to delete
     */
    async deleteMessage(phone, messageId) {
        try {
            if (!this.isConfigured()) {
                return { success: false, error: 'Z-API not configured' };
            }

            const url = this.getApiUrl('delete-message');
            const data = {
                phone: phone.replace(/\D/g, ''),
                messageId,
            };

            const response = await axios.post(url, data, { headers: this.headers });
            console.log(`[WhatsAppService] Message deleted`);
            return { success: true, data: response.data };
        } catch (error) {
            console.error('[WhatsAppService] Error deleting message:', error.response?.data || error.message);
            return { success: false, error: error.response?.data || error.message };
        }
    }

    // ===========================================
    // CONTACTS
    // ===========================================

    /**
     * Get all contacts
     */
    async getContacts() {
        try {
            if (!this.isConfigured()) {
                return { success: false, error: 'Z-API not configured' };
            }

            const url = this.getApiUrl('contacts');
            const response = await axios.get(url, { headers: this.headers });
            return { success: true, data: response.data };
        } catch (error) {
            console.error('[WhatsAppService] Error getting contacts:', error.response?.data || error.message);
            return { success: false, error: error.response?.data || error.message };
        }
    }

    /**
     * Check if phone has WhatsApp
     * @param {string} phone - Phone number to check
     */
    async phoneExists(phone) {
        try {
            if (!this.isConfigured()) {
                return { success: false, exists: false, error: 'Z-API not configured' };
            }

            const cleanPhone = phone.replace(/\D/g, '');
            const url = this.getApiUrl(`phone-exists/${cleanPhone}`);
            const response = await axios.get(url, { headers: this.headers });
            return { success: true, exists: response.data?.exists || false, data: response.data };
        } catch (error) {
            console.error('[WhatsAppService] Error checking phone:', error.response?.data || error.message);
            return { success: false, exists: false, error: error.response?.data || error.message };
        }
    }

    /**
     * Get profile picture
     * @param {string} phone - Phone number
     */
    async getProfilePicture(phone) {
        try {
            if (!this.isConfigured()) {
                return { success: false, error: 'Z-API not configured' };
            }

            const cleanPhone = phone.replace(/\D/g, '');
            const url = this.getApiUrl(`profile-picture/${cleanPhone}`);
            const response = await axios.get(url, { headers: this.headers });
            return { success: true, data: response.data };
        } catch (error) {
            console.error('[WhatsAppService] Error getting profile picture:', error.response?.data || error.message);
            return { success: false, error: error.response?.data || error.message };
        }
    }

    /**
     * Block contact
     * @param {string} phone - Phone number to block
     */
    async blockContact(phone) {
        try {
            if (!this.isConfigured()) {
                return { success: false, error: 'Z-API not configured' };
            }

            const url = this.getApiUrl('block-contact');
            const data = { phone: phone.replace(/\D/g, '') };
            const response = await axios.post(url, data, { headers: this.headers });
            return { success: true, data: response.data };
        } catch (error) {
            console.error('[WhatsAppService] Error blocking contact:', error.response?.data || error.message);
            return { success: false, error: error.response?.data || error.message };
        }
    }

    // ===========================================
    // WEBHOOKS
    // ===========================================

    /**
     * Configure webhook for received messages
     * @param {string} webhookUrl - URL to receive webhooks
     */
    async setWebhookReceived(webhookUrl) {
        try {
            if (!this.isConfigured()) {
                return { success: false, error: 'Z-API not configured' };
            }

            const url = this.getApiUrl('update-webhook-received');
            const data = { value: webhookUrl };
            const response = await axios.put(url, data, { headers: this.headers });
            console.log(`[WhatsAppService] Webhook received configured: ${webhookUrl}`);
            return { success: true, data: response.data };
        } catch (error) {
            console.error('[WhatsAppService] Error setting webhook received:', error.response?.data || error.message);
            return { success: false, error: error.response?.data || error.message };
        }
    }

    /**
     * Configure webhook for message status updates
     * @param {string} webhookUrl - URL to receive status webhooks
     */
    async setWebhookMessageStatus(webhookUrl) {
        try {
            if (!this.isConfigured()) {
                return { success: false, error: 'Z-API not configured' };
            }

            const url = this.getApiUrl('update-webhook-message-status');
            const data = { value: webhookUrl };
            const response = await axios.put(url, data, { headers: this.headers });
            console.log(`[WhatsAppService] Webhook message status configured: ${webhookUrl}`);
            return { success: true, data: response.data };
        } catch (error) {
            console.error('[WhatsAppService] Error setting webhook status:', error.response?.data || error.message);
            return { success: false, error: error.response?.data || error.message };
        }
    }

    // ===========================================
    // ADMIN ALERTS
    // ===========================================

    /**
     * Send a message to the admin
     * @param {string} message - Message to send
     */
    async sendAdminAlert(message) {
        if (!env.ADMIN_PHONE) {
            console.warn('[WhatsAppService] Admin phone not configured');
            return { success: false, error: 'Admin phone not configured' };
        }

        return this.sendText(env.ADMIN_PHONE, `🔔 *ALERTA CRM SOLAR*\n\n${message}`);
    }
}

module.exports = new WhatsAppService();
