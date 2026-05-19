'use server';

import { PESAPAL_CONFIG } from '@/lib/pesapal-config';
import { initializeFirebase } from '@/firebase';
import { ref, update, increment, push, set, get } from 'firebase/database';

/**
 * @fileOverview PesaPal integration actions for API v3.
 * Hardened for production with strict User ID extraction and real-time awarding.
 */

export interface TransactionStatusResponse {
  amount: number;
  currency: string;
  status_code: number;
  payment_method: string;
}

export async function getAccessToken(): Promise<string> {
  const consumerKey = PESAPAL_CONFIG.CONSUMER_KEY;
  const consumerSecret = PESAPAL_CONFIG.CONSUMER_SECRET;

  if (!consumerKey || !consumerSecret) {
    console.error("[PesaPal Auth] CRITICAL ERROR: PESAPAL_CONSUMER_KEY or SECRET missing.");
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

export async function initiatePesaPalPayment(amount: number, user: { uid: string, email: string, name: string }) {
  try {
    const ipnId = PESAPAL_CONFIG.IPN_ID;
    if (!ipnId) {
      return { success: false, error: "Configuration Error: IPN ID missing. Visit /pesapal-admin." };
    }

    const token = await getAccessToken();
    const merchantReference = `QV_${user.uid}_${Date.now()}`;
    
    const payload = {
      id: merchantReference,
      currency: "KES",
      amount: amount,
      description: `QIVO Recharge for ${user.name}`,
      callback_url: PESAPAL_CONFIG.CALLBACK_URL,
      notification_id: ipnId,
      billing_address: {
        email_address: user.email,
        phone_number: "",
        country_code: "KE",
        first_name: user.name.split(' ')[0] || "User",
        last_name: user.name.split(' ')[1] || "QIVO",
        line_1: "Nairobi",
        city: "Nairobi",
        state: "Nairobi",
        postal_code: "00100",
        zip_code: "00100"
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

export async function getTransactionStatus(orderTrackingId: string): Promise<TransactionStatusResponse | null> {
  try {
    const token = await getAccessToken();
    const response = await fetch(`${PESAPAL_CONFIG.API_BASE_URL}/api/Transactions/GetTransactionStatus?orderTrackingId=${orderTrackingId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) return null;
    const data = await response.json();
    
    return {
      amount: Number(data.amount || 0),
      currency: data.currency || 'KES',
      status_code: Number(data.status_code),
      payment_method: data.payment_method || 'Unknown'
    };
  } catch (error: any) {
    return null;
  }
}

export async function fulfillPaymentAction(orderTrackingId: string, merchantReference: string) {
  console.log(`[PesaPal Fulfillment] Verifying Order: ${orderTrackingId}`);
  
  try {
    const status = await getTransactionStatus(orderTrackingId);
    
    // Status 1 = Completed
    if (status && status.status_code === 1) {
      const { database: rtdb } = initializeFirebase();
      if (!rtdb) return { success: false, error: "Database not connected" };
      
      // Extraction: QV_{uid}_{timestamp}
      const parts = merchantReference.split('_');
      const uid = parts[1];

      if (!uid || uid.length < 10) {
        console.error("[PesaPal Fulfillment] Invalid UID extracted:", uid);
        return { success: false, error: "Invalid User Reference" };
      }

      // Idempotency: Prevent double-award
      const processedRef = ref(rtdb, `processed_payments/${orderTrackingId}`);
      const snap = await get(processedRef);
      if (snap.exists()) {
        return { success: true, message: "Already awarded", coins: snap.val().coins };
      }

      const amount = Number(status.amount);
      let coinsToAward = 0;
      
      if (amount >= 1800) coinsToAward = 20000;
      else if (amount >= 1000) coinsToAward = 10000;
      else if (amount >= 550) coinsToAward = 5000;
      else if (amount >= 230) coinsToAward = 2000;
      else if (amount >= 120) coinsToAward = 1000;
      else if (amount >= 80) coinsToAward = 500;
      else if (amount >= 1) coinsToAward = 200; 

      if (coinsToAward > 0) {
        const timestamp = Date.now();
        const updates: any = {};
        
        updates[`balances/${uid}/coins`] = increment(coinsToAward);
        updates[`balances/${uid}/updatedAt`] = timestamp;
        updates[`processed_payments/${orderTrackingId}`] = {
          uid, amount, coins: coinsToAward, timestamp, merchantReference, payment_method: status.payment_method
        };

        await update(ref(rtdb), updates);

        await set(push(ref(rtdb, `coin_history/${uid}`)), {
          amount: coinsToAward,
          type: 'recharge',
          description: `PesaPal: KES ${amount}`,
          timestamp
        });

        console.log(`[PesaPal Fulfillment] SUCCESS: Awarded ${coinsToAward} coins to ${uid}`);
        return { success: true, coins: coinsToAward };
      }
      return { success: false, error: "Amount too low for coins" };
    }
    return { success: false, error: "Payment verification failed or pending" };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function registerIPN() {
  try {
    const token = await getAccessToken();
    const response = await fetch(`${PESAPAL_CONFIG.API_BASE_URL}/api/URLSetup/RegisterIPN`, {
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
    const response = await fetch(`${PESAPAL_CONFIG.API_BASE_URL}/api/URLSetup/GetIpnList`, {
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
