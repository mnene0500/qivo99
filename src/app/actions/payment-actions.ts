'use server';

import { supabase } from '@/lib/supabase';
import { PESAPAL_CONFIG } from '@/lib/pesapal-config';

/**
 * @fileOverview Secure PesaPal Proxies via Supabase Edge Functions.
 * These actions bridge the frontend to the protected environment where API keys reside.
 */

export async function initiatePesaPalPayment(amount: number, user: { uid: string, email: string, name: string }) {
  try {
    console.log(`[Payment] Initiating transaction for ${user.uid} - Amount: ${amount}`);
    
    const { data, error } = await supabase.functions.invoke('payment-ops', {
      body: { 
        action: 'initiate',
        amount,
        user,
        callback_url: PESAPAL_CONFIG.CALLBACK_URL
      }
    });

    if (error) {
      console.error("[Payment Error] Edge Function fail:", error);
      return { success: false, error: "Payment gateway connection timeout." };
    }

    return data || { success: false, error: "Empty response from server." };
  } catch (err: any) { 
    console.error("[Payment Crash] Proxy exception:", err);
    return { success: false, error: "Critical payment service failure." }; 
  }
}

/**
 * Manual fulfillment check. Usually triggered by the user returning to the app
 * before the IPN webhook arrives.
 */
export async function fulfillPaymentAction(orderTrackingId: string, merchantReference: string) {
  try {
    console.log(`[Fulfillment] Verifying order: ${orderTrackingId}`);
    
    const { data, error } = await supabase.functions.invoke('payment-ops', {
      body: { 
        action: 'fulfill',
        orderTrackingId,
        merchantReference
      }
    });

    if (error) {
      // Don't throw error here, just return failure so the UI keeps polling
      return { success: false, error: error.message };
    }
    
    return data || { success: false };
  } catch (err: any) { 
    console.error("[Fulfillment Error]:", err);
    return { success: false, error: "Verification in progress..." }; 
  }
}
