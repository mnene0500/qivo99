/**
 * @fileOverview Configuration for PesaPal v3 API.
 * Optimized for qivo-gamma.vercel.app production environment.
 */

export const PESAPAL_CONFIG = {
  CONSUMER_KEY: process.env.PESAPAL_CONSUMER_KEY || '',
  CONSUMER_SECRET: process.env.PESAPAL_CONSUMER_SECRET || '',
  // Live Production URL
  API_BASE_URL: process.env.PESAPAL_API_BASE_URL || 'https://pay.pesapal.com/v3',
  IPN_URL: 'https://qivo-gamma.vercel.app/api/pesapal/callback',
  CALLBACK_URL: 'https://qivo-gamma.vercel.app/recharge',
  // IPN ID is required for live payments to trigger the webhook
  IPN_ID: process.env.PESAPAL_IPN_ID || '', 
};
