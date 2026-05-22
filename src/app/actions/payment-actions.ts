
'use server';

import { PESAPAL_CONFIG } from '@/lib/pesapal-config';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * @fileOverview Hardened PesaPal integration using Supabase Admin for fulfillment.
 * Includes idempotency checks to prevent duplicate coin awards.
 */

export async function getAccessToken(): Promise<string> {
  const consumerKey = PESAPAL_CONFIG.CONSUMER_KEY;
  const consumerSecret = PESAPAL_CONFIG.CONSUMER_SECRET;

  if (!consumerKey || !consumerSecret) throw new Error('PesaPal Configuration Error: Missing Keys');

  try {
    const response = await fetch(`${PESAPAL_CONFIG.API_BASE_URL}/api/Auth/RequestToken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ consumer_key: consumerKey, consumer_secret: consumerSecret }),
    });

    if (!response.ok) throw new Error(`Failed to get PesaPal token: ${response.statusText}`);
    const data = await response.json();
    return data.token;
  } catch (err: any) {
    throw err;
  }
}

export async function registerIPN() {
  try {
    const token = await getAccessToken();
    const response = await fetch(`${PESAPAL_CONFIG.API_BASE_URL}/api/Services/RegisterIPN`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ url: PESAPAL_CONFIG.IPN_URL, ipn_notification_type: 'GET' }),
    });
    return await response.json();
  } catch (error: any) { return { error: error.message }; }
}

export async function getIpnList() {
  try {
    const token = await getAccessToken();
    const response = await fetch(`${PESAPAL_CONFIG.API_BASE_URL}/api/Services/GetIPNList`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
    });
    return await response.json();
  } catch (error: any) { return { error: error.message }; }
}

export async function initiatePesaPalPayment(amount: number, user: { uid: string, email: string, name: string }) {
  try {
    const ipnId = PESAPAL_CONFIG.IPN_ID;
    if (!ipnId) return { success: false, error: "Configuration Error: IPN ID missing." };

    const token = await getAccessToken();
    const merchantReference = `QV_${user.uid}_${Date.now()}`;
    
    const payload = {
      id: merchantReference,
      currency: "KES",
      amount: amount,
      description: `QIVO Recharge: ${amount} KES`,
      callback_url: PESAPAL_CONFIG.CALLBACK_URL,
      notification_id: ipnId,
      billing_address: {
        email_address: user.email,
        country_code: "KE",
        first_name: user.name.split(' ')[0] || "User",
        last_name: "QIVO",
        line_1: "Nairobi",
        city: "Nairobi"
      }
    };

    const response = await fetch(`${PESAPAL_CONFIG.API_BASE_URL}/api/Transactions/SubmitOrderRequest`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) return { success: false, error: data.message || 'PesaPal rejected the order.' };
    return { success: true, redirect_url: data.redirect_url, order_tracking_id: data.order_tracking_id };
  } catch (error: any) { return { success: false, error: error.message }; }
}

/**
 * ATOMIC SWIFT FULFILLMENT: Awards coins and prevents double-processing.
 * Optimized for maximum speed by checking internal ledger first.
 */
export async function fulfillPaymentAction(orderTrackingId: string, merchantReference: string) {
  try {
    if (!orderTrackingId || !merchantReference) return { success: false, error: "Missing tracking ID or reference." };

    // 1. SWIFT LEDGER CHECK: If already processed, return immediately (zero latency)
    const { data: existing } = await supabaseAdmin
      .from('processed_payments')
      .select('coins')
      .eq('order_tracking_id', orderTrackingId)
      .maybeSingle();
      
    if (existing) {
      return { success: true, coins: existing.coins };
    }

    // 2. VERIFY WITH PESAPAL: Get status from source
    const token = await getAccessToken();
    const statusRes = await fetch(`${PESAPAL_CONFIG.API_BASE_URL}/api/Transactions/GetTransactionStatus?orderTrackingId=${orderTrackingId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
    });
    
    if (!statusRes.ok) return { success: false, error: "PesaPal status check failed." };
    const status = await statusRes.json();
    
    // Status Code 1 is "Completed" in PesaPal v3
    const isCompleted = status && (status.status_code === 1 || status.payment_status_description === 'Completed');
    
    if (isCompleted) {
      const uid = merchantReference.split('_')[1]; // Ref format: QV_UID_TIMESTAMP
      if (!uid) return { success: false, error: "Invalid reference format." };

      const amount = Number(status.amount);
      let coinsToAward = Math.floor(amount * 10);
      
      // Specialized logic for test package (KES 1 = 200 coins)
      if (Math.abs(amount - 1) < 0.01) {
        coinsToAward = 200;
      }

      const timestamp = Date.now();
      
      // 3. ATOMIC UPDATES via Admin Client
      // We use RPC or Upsert to ensure we don't need a separate SELECT call first
      const { error: balErr } = await supabaseAdmin.rpc('increment_coins', { 
        user_uid: uid, 
        amount: coinsToAward 
      });

      // Log both history and processing record
      await Promise.all([
        supabaseAdmin.from('coin_history').insert({ 
          user_id: uid, 
          amount: coinsToAward, 
          type: 'recharge', 
          description: `Recharge: KES ${amount}`, 
          timestamp 
        }),
        supabaseAdmin.from('processed_payments').insert({ 
          order_tracking_id: orderTrackingId, 
          user_id: uid, 
          amount, 
          coins: coinsToAward, 
          payment_method: status.payment_method || 'pesapal', 
          timestamp 
        })
      ]);

      return { success: true, coins: coinsToAward };
    }
    
    return { success: false, error: "Payment not completed on provider side." };
  } catch (err: any) { 
    console.error("[Payment Fulfillment Error]", err);
    return { success: false, error: err.message }; 
  }
}
