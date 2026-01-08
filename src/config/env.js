require('dotenv').config();

const path = require('path');

module.exports = {
  // Server
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',

  // Database (External PostgreSQL)
  DB_HOST: process.env.DB_HOST || '69.62.99.122',
  DB_PORT: process.env.DB_PORT || 3212,
  DB_NAME: process.env.DB_NAME || 'painelsolarbd',
  DB_USER: process.env.DB_USER || 'painelsolarbd',
  DB_PASSWORD: process.env.DB_PASSWORD || 'painelsolarbd',

  // JWT
  JWT_SECRET: process.env.JWT_SECRET || 'solar_crm_jwt_secret_2024_dge_energia',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',

  // OpenAI
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',

  // Z-API (WhatsApp)
  ZAPI_INSTANCE_ID: process.env.ZAPI_INSTANCE_ID || '',
  ZAPI_TOKEN: process.env.ZAPI_TOKEN || '',
  ZAPI_CLIENT_TOKEN: process.env.ZAPI_CLIENT_TOKEN || '',
  ZAPI_BASE_URL: process.env.ZAPI_BASE_URL || 'https://api.z-api.io',

  // Admin
  ADMIN_PHONE: process.env.ADMIN_PHONE || '',

  // Meta (Facebook/Instagram) Lead Ads
  META_PAGE_ACCESS_TOKEN: (process.env.META_PAGE_ACCESS_TOKEN || process.env.FB_PAGE_ACCESS_TOKEN || '').trim(),
  META_APP_ID: process.env.META_APP_ID || '',
  META_APP_SECRET: process.env.META_APP_SECRET || '',
  META_VERIFY_TOKEN: process.env.META_VERIFY_TOKEN || 'solar_crm_verify',
};

