
'use server';

import { supabase } from '@/lib/supabase';
import { PESAPAL_CONFIG } from '@/lib/pesapal-config';
import { processFulfillment } from '@/services/payment-service';

/**
 * @fileOverview Secure PesaPal Proxies via Supabase Edge Functions.
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
 * Server Action wrapper for fulfillment.
 */
export async function fulfillPaymentAction(orderTrackingId: string, merchantReference: string) {
  return processFulfillment(orderTrackingId, merchantReference);
}

/**
 * Registers the IPN URL for the current environment with PesaPal.
 */
export async function registerIPN() {
  const { data, error } = await supabase.functions.invoke('payment-ops', {
    body: { action: 'register_ipn' }
  });
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Retrieves a list of all registered IPNs from PesaPal.
 */
export async function getIpnList() {
  const { data, error } = await supabase.functions.invoke('payment-ops', {
    body: { action: 'get_ipns' }
  });
  if (error) throw new Error(error.message);
  return data;
}
