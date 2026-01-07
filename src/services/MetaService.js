const axios = require('axios');
const env = require('../config/env');

/**
 * Meta Service - Facebook/Instagram Graph API Integration
 * Handles Lead Ads data retrieval with campaign metadata
 */
class MetaService {
    constructor() {
        this.baseUrl = 'https://graph.facebook.com/v22.0';
        this.accessToken = env.META_PAGE_ACCESS_TOKEN;
    }

    /**
     * Check if Meta integration is configured
     */
    isConfigured() {
        return !!this.accessToken;
    }

    /**
     * Complete lead retrieval with all campaign metadata
     * @param {string} leadgenId - The lead ID from webhook
     * @param {string} adId - The ad ID from webhook (optional, will be fetched if not provided)
     */
    async getCompleteLeadData(leadgenId, adId = null) {
        if (!this.isConfigured()) {
            throw new Error('Meta API not configured. Set META_PAGE_ACCESS_TOKEN in .env');
        }

        try {
            // Step 1: Get lead form data
            const leadData = await this.getLeadData(leadgenId);
            console.log(`[MetaService] Lead data fetched: ${leadgenId}`);

            // Use ad_id from lead data if not provided
            const actualAdId = adId || leadData.ad_id;

            let campaignData = {};
            if (actualAdId) {
                // Step 2: Get ad metadata
                const adData = await this.getAdData(actualAdId);
                console.log(`[MetaService] Ad data fetched: ${actualAdId}`);

                // Step 3 & 4: Get campaign and adset names
                if (adData.campaign_id) {
                    const campaign = await this.getCampaignData(adData.campaign_id);
                    campaignData.campaign_name = campaign.name;
                    campaignData.campaign_id = adData.campaign_id;
                }

                if (adData.adset_id) {
                    const adset = await this.getAdSetData(adData.adset_id);
                    campaignData.adset_name = adset.name;
                    campaignData.adset_id = adData.adset_id;
                }

                campaignData.ad_name = adData.name;
                campaignData.ad_id = actualAdId;
            }

            // Parse field_data into a more usable format
            const formFields = this.parseFieldData(leadData.field_data || []);

            return {
                leadgen_id: leadgenId,
                created_time: leadData.created_time,
                form_id: leadData.form_id,
                ...formFields,
                meta_campaign_data: campaignData,
            };
        } catch (error) {
            console.error('[MetaService] Error fetching complete lead data:', error.message);
            throw error;
        }
    }

    /**
     * Step 1: Fetch lead form data
     */
    async getLeadData(leadgenId) {
        const response = await axios.get(`${this.baseUrl}/${leadgenId}`, {
            params: {
                access_token: this.accessToken,
                fields: 'created_time,id,ad_id,form_id,field_data',
            },
        });
        return response.data;
    }

    /**
     * Step 2: Fetch ad metadata
     */
    async getAdData(adId) {
        const response = await axios.get(`${this.baseUrl}/${adId}`, {
            params: {
                access_token: this.accessToken,
                fields: 'name,campaign_id,adset_id',
            },
        });
        return response.data;
    }

    /**
     * Step 3: Fetch campaign name
     */
    async getCampaignData(campaignId) {
        const response = await axios.get(`${this.baseUrl}/${campaignId}`, {
            params: {
                access_token: this.accessToken,
                fields: 'name',
            },
        });
        return response.data;
    }

    /**
     * Step 4: Fetch ad set name
     */
    async getAdSetData(adsetId) {
        const response = await axios.get(`${this.baseUrl}/${adsetId}`, {
            params: {
                access_token: this.accessToken,
                fields: 'name',
            },
        });
        return response.data;
    }

    /**
     * Parse field_data array into object
     * Converts [{ name: "full_name", values: ["João"] }] to { full_name: "João" }
     */
    parseFieldData(fieldData) {
        const result = {};

        for (const field of fieldData) {
            const value = field.values?.[0] || null;

            // Map common field names to our Lead model
            switch (field.name) {
                case 'full_name':
                case 'nome':
                case 'name':
                    result.name = value;
                    break;
                case 'phone_number':
                case 'telefone':
                case 'phone':
                    result.phone = this.normalizePhone(value);
                    break;
                case 'email':
                    result.email = value;
                    break;
                case 'city':
                case 'cidade':
                    result.city = value;
                    break;
                default:
                    // Store any other fields in a custom object
                    if (!result.custom_fields) result.custom_fields = {};
                    result.custom_fields[field.name] = value;
            }
        }

        return result;
    }

    /**
     * Normalize phone number to Brazilian format
     */
    normalizePhone(phone) {
        if (!phone) return null;

        // Remove all non-digits
        let clean = phone.replace(/\D/g, '');

        // Remove country code if present
        if (clean.startsWith('55') && clean.length > 11) {
            clean = clean.substring(2);
        }

        // Add country code back
        if (clean.length === 10 || clean.length === 11) {
            return `55${clean}`;
        }

        return clean;
    }

    /**
     * Exchange short-lived token for long-lived token
     */
    async exchangeForLongLivedToken(shortLivedToken, appId, appSecret) {
        try {
            const response = await axios.get(`${this.baseUrl}/oauth/access_token`, {
                params: {
                    grant_type: 'fb_exchange_token',
                    client_id: appId,
                    client_secret: appSecret,
                    fb_exchange_token: shortLivedToken,
                },
            });

            console.log('[MetaService] Long-lived token obtained, expires in:', response.data.expires_in, 'seconds');
            return response.data.access_token;
        } catch (error) {
            console.error('[MetaService] Error exchanging token:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Get page access token from long-lived user token
     */
    async getPageAccessToken(longLivedUserToken, pageId = null) {
        try {
            // Get user ID first
            const meResponse = await axios.get(`${this.baseUrl}/me`, {
                params: { access_token: longLivedUserToken },
            });
            const userId = meResponse.data.id;

            // Get pages
            const pagesResponse = await axios.get(`${this.baseUrl}/${userId}/accounts`, {
                params: { access_token: longLivedUserToken },
            });

            const pages = pagesResponse.data.data;

            if (pageId) {
                const page = pages.find(p => p.id === pageId);
                return page?.access_token;
            }

            // Return first page token if no specific page requested
            return pages[0]?.access_token;
        } catch (error) {
            console.error('[MetaService] Error getting page token:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Subscribe a page to receive leadgen webhooks
     */
    async subscribePageToLeadgen(pageId, pageAccessToken) {
        try {
            const response = await axios.post(
                `${this.baseUrl}/${pageId}/subscribed_apps`,
                null,
                {
                    params: {
                        subscribed_fields: 'leadgen',
                        access_token: pageAccessToken,
                    },
                }
            );

            console.log('[MetaService] Page subscribed to leadgen:', response.data);
            return response.data;
        } catch (error) {
            console.error('[MetaService] Error subscribing page:', error.response?.data || error.message);
            throw error;
        }
    }
}

module.exports = new MetaService();
