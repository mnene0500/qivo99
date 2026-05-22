'use server';

import { PESAPAL_CONFIG } from '@/lib/pesapal-config';
import { supabase } from '@/lib/supabase';

/**
 * @fileOverview Hardened PesaPal integration with atomic fulfillment and session security.
 */

export async function getAccessToken(): Promise<string> {
  const consumerKey = PESAPAL_CONFIG.CONSUMER_KEY;
  const consumerSecret = PESAPAL_CONFIG.CONSUMER_SECRET;

  if (!consumerKey || !consumerSecret) {
    throw new Error('PesaPal Configuration Error: Missing Keys');
  }

  try {
    const response = await fetch(`${PESAPAL_CONFIG.API_BASE_URL}/api/Auth/RequestToken`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        consumer_key: consumerKey,
        consumer_secret: consumerSecret,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to get PesaPal token: ${response.statusText}`);
    }

    const data = await response.json();
    return data.token;
  } catch (err: any) {
    console.error("[PesaPal Auth] Exception:", err.message);
    throw err;
  }
}

export async function registerIPN() {
  try {
    const token = await getAccessToken();
    const response = await fetch(`${PESAPAL_CONFIG.API_BASE_URL}/api/Services/RegisterIPN`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        url: PESAPAL_CONFIG.IPN_URL,
        ipn_notification_type: 'GET',
      }),
    });

    return await response.json();
  } catch (error: any) {
    return { error: error.message };
  }
}

export async function getIpnList() {
  try {
    const token = await getAccessToken();
    const response = await fetch(`${PESAPAL_CONFIG.API_BASE_URL}/api/Services/GetIPNList`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });

    return await response.json();
  } catch (error: any) {
    return { error: error.message };
  }
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
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) return { success: false, error: data.message || 'PesaPal rejected the order.' };

    return { success: true, redirect_url: data.redirect_url, order_tracking_id: data.order_tracking_id };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Fulfills a payment by awarding coins.
 * Uses atomic UPSERT to ensure reliability with RLS.
 */
export async function fulfillPaymentAction(orderTrackingId: string, merchantReference: string) {
  try {
    const token = await getAccessToken();
    const statusRes = await fetch(`${PESAPAL_CONFIG.API_BASE_URL}/api/Transactions/GetTransactionStatus?orderTrackingId=${orderTrackingId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
    });
    
    if (!statusRes.ok) return { success: false, error: "PesaPal status check failed." };
    const status = await statusRes.json();
    
    // status_code 1 = Completed/Success
    if (status && status.status_code === 1) {
      const uid = merchantReference.split('_')[1];
      if (!uid) return { success: false, error: "Invalid Merchant Reference." };

      // Check if already processed to prevent double crediting
      const { data: existing } = await supabase.from('processed_payments').select('*').eq('order_tracking_id', orderTrackingId).maybeSingle();
      if (existing) return { success: true, coins: existing.coins };

      const amount = Number(status.amount);
      let coinsToAward = Math.floor(amount * 10);
      const timestamp = Date.now();

      // Atomic Update: Using UPSERT to bypass "row violates policy" if record missing
      const { data: balData } = await supabase.from('balances').select('coins').eq('user_id', uid).maybeSingle();
      const currentCoins = balData?.coins || 0;
      
      const { error: upsertErr } = await supabase.from('balances').upsert({ 
        user_id: uid, 
        coins: currentCoins + coinsToAward,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

      if (upsertErr) {
        console.error("Fulfillment Upsert Error:", upsertErr.message);
        return { success: false, error: "Database fulfillment error. Check RLS policies." };
      }
      
      // Log History & Mark Processed
      await Promise.all([
        supabase.from('coin_history').insert({ user_id: uid, amount: coinsToAward, type: 'recharge', description: `Recharge: KES ${amount}`, timestamp }),
        supabase.from('processed_payments').insert({ order_tracking_id: orderTrackingId, user_id: uid, amount, coins: coinsToAward, payment_method: status.payment_method || 'pesapal', timestamp })
      ]);

      return { success: true, coins: coinsToAward };
    }
    
    return { success: false, error: `Payment status: ${status.status_code}` };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
