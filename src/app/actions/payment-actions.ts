
'use server';

import { supabase } from '@/lib/supabase';

const PESA_ENV = "https://pay.pesapal.com/v3";

/**
 * @fileOverview Native PesaPal Integration for Vercel.
 * Uses secure environment variables (no NEXT_PUBLIC_).
 */

async function getPesapalToken() {
  const consumerKey = process.env.PESAPAL_CONSUMER_KEY;
  const consumerSecret = process.env.PESAPAL_CONSUMER_SECRET;

  if (!consumerKey || !consumerSecret) {
    throw new Error("PesaPal Credentials missing in Vercel Settings.");
  }

  const res = await fetch(`${PESA_ENV}/api/Auth/RequestToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      consumer_key: consumerKey,
      consumer_secret: consumerSecret,
    }),
  });
  const data = await res.json();
  if (!data.token) throw new Error("PesaPal Authentication failed.");
  return data.token;
}

export async function initiatePesaPalPayment(amount: number, user: { uid: string, email: string, name: string }) {
  try {
    const token = await getPesapalToken();
    const orderId = crypto.randomUUID();

    // 1. Record pending payment for security
    const { error: pendingError } = await supabase.from("pending_payments").insert({
      order_id: orderId,
      user_id: user.uid,
      amount: Number(amount),
      status: "pending"
    });
    if (pendingError) throw new Error(`Log Error: ${pendingError.message}`);

    // 2. Submit order to PesaPal
    const order = {
      id: orderId,
      currency: "KES",
      amount: Number(amount),
      description: "QIVO Coins Recharge",
      callback_url: "https://qivo-gamma.vercel.app/payment-success",
      notification_id: process.env.PESAPAL_IPN_ID,
      billing_address: { email_address: user.email || "user@qivo.app" },
    };

    const res = await fetch(`${PESA_ENV}/api/Transactions/SubmitOrderRequest`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        "Authorization": `Bearer ${token}` 
      },
      body: JSON.stringify(order),
    });
    const data = await res.json();

    if (!data.redirect_url) throw new Error(data.error?.message || "Gateway failed to generate redirect.");

    return { success: true, redirect_url: data.redirect_url };
  } catch (err: any) {
    console.error("[PesaPal Initiate Error]:", err.message);
    return { success: false, error: err.message };
  }
}

export async function verifyPaymentAction(orderTrackingId: string, user_id: string) {
  try {
    const token = await getPesapalToken();
    
    // 1. Check status with PesaPal
    const verifyRes = await fetch(`${PESA_ENV}/api/Transactions/GetTransactionStatus?orderTrackingId=${orderTrackingId}`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${token}` },
    });
    const statusData = await verifyRes.json();

    if (statusData.payment_status_description === "Completed") {
      const paidAmount = Math.round(Number(statusData.amount));
      
      // Package Mapping
      let coins = Math.floor(paidAmount * 6.25);
      if (paidAmount <= 1) coins = 200;
      else if (paidAmount === 80) coins = 500;
      else if (paidAmount === 120) coins = 1000;
      else if (paidAmount === 230) coins = 2000;
      else if (paidAmount === 550) coins = 5000;
      else if (paidAmount === 1000) coins = 10000;
      else if (paidAmount === 1800) coins = 20000;

      // 2. Idempotency check: Don't award twice
      const { data: existing } = await supabase.from('processed_payments').select('order_tracking_id').eq('order_tracking_id', orderTrackingId).maybeSingle();
      if (existing) return { success: true, message: "Already fulfilled", coins_added: 0 };

      // 3. Atomic Balance Update
      const { error: rpcError } = await supabase.rpc("increment_coins", { user_id, amount: coins });
      if (rpcError) throw new Error(`Balance Update Failed: ${rpcError.message}`);

      // 4. Log successful fulfillment
      await supabase.from('processed_payments').insert({ order_tracking_id: orderTrackingId, user_id, amount: paidAmount, coins });
      
      await supabase.from("coin_history").insert({
        user_id,
        amount: coins,
        type: "recharge",
        description: "PesaPal Verified Recharge",
        timestamp: Date.now()
      });

      return { success: true, coins_added: coins };
    }
    
    return { success: false, message: "Payment pending or failed at gateway." };
  } catch (err: any) {
    console.error("[PesaPal Verify Error]:", err.message);
    return { success: false, error: err.message };
  }
}
