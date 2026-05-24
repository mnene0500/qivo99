'use server';

import { getSupabaseAdmin } from '@/lib/supabase';

const PESAPAL_BASE_URL = "https://pay.pesapal.com/v3";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://qivo-five.vercel.app";

async function getAuthToken() {
  const res = await fetch(`${PESAPAL_BASE_URL}/api/Auth/RequestToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      consumer_key: process.env.PESAPAL_CONSUMER_KEY,
      consumer_secret: process.env.PESAPAL_CONSUMER_SECRET
    })
  });
  const data = await res.json();
  if (!data.token) throw new Error("PesaPal Auth Failed. Check your Consumer Key/Secret.");
  return data.token;
}

export async function initiatePesaPalPayment(uid: string, amount: number, coins: number) {
  try {
    const token = await getAuthToken();
    const orderId = crypto.randomUUID();
    
    const supabase = getSupabaseAdmin();
    await supabase.from('pending_payments').insert({
      order_id: orderId,
      user_id: uid,
      amount,
      status: 'pending'
    });

    const payload = {
      id: orderId,
      currency: "KES",
      amount: amount,
      description: `Purchase of ${coins} QIVO Coins`,
      callback_url: `${APP_URL}/payment-success`,
      notification_id: process.env.PESAPAL_IPN_ID,
      billing_address: { 
        email_address: "billing@qivo.app",
        first_name: "QIVO",
        last_name: "User"
      }
    };

    const res = await fetch(`${PESAPAL_BASE_URL}/api/Transactions/SubmitOrderRequest`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!data.redirect_url) throw new Error(data.message || "Failed to get redirect URL from PesaPal");

    return { success: true, redirect_url: data.redirect_url, orderId };
  } catch (error: any) {
    console.error("[PesaPal Error]:", error.message);
    return { success: false, error: error.message };
  }
}

export async function verifyPaymentAction(orderTrackingId: string, merchantReference: string) {
  try {
    const token = await getAuthToken();
    const res = await fetch(`${PESAPAL_BASE_URL}/api/Transactions/GetTransactionStatus?orderTrackingId=${orderTrackingId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const data = await res.json();
    
    if (data.status_code === 1 || data.payment_status_description === "Completed") {
      const supabase = getSupabaseAdmin();
      
      const { data: existing } = await supabase.from('processed_payments').select('*').eq('order_tracking_id', orderTrackingId).maybeSingle();
      if (existing) return { success: true, coins: existing.coins, message: "Already processed." };

      const { data: pending } = await supabase.from('pending_payments').select('*').eq('order_id', merchantReference).single();
      if (!pending) throw new Error("Payment record matching this reference not found.");

      let coins = 0;
      const amt = Number(pending.amount);
      
      if (amt === 1) coins = 10;
      else if (amt === 60) coins = 500;
      else if (amt === 120) coins = 1000;
      else if (amt === 180) coins = 1500;
      else if (amt === 240) coins = 2000;
      else if (amt === 600) coins = 5000;
      else coins = Math.floor(amt * 8.33);

      const { error: rpcErr } = await supabase.rpc("increment_coins", { user_id: pending.user_id, amount: coins });
      if (rpcErr) throw rpcErr;

      await Promise.all([
        supabase.from('processed_payments').insert({
          order_tracking_id: orderTrackingId,
          user_id: pending.user_id,
          amount: pending.amount,
          coins: coins,
          payment_method: data.payment_method || 'PesaPal'
        }),
        supabase.from('coin_history').insert({
          user_id: pending.user_id,
          amount: coins,
          type: 'purchase',
          description: `PesaPal Top-up: ${pending.amount} KES`,
          timestamp: Date.now()
        }),
        supabase.from('pending_payments').update({ status: 'completed' }).eq('order_id', merchantReference)
      ]);

      return { success: true, coins };
    }
    
    return { success: false, error: "Payment is still processing at PesaPal." };
  } catch (err: any) {
    console.error("[Verification Error]:", err.message);
    return { success: false, error: err.message };
  }
}
