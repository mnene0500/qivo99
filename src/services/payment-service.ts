
import { supabase } from '@/lib/supabase';

/**
 * @fileOverview Shared Business Logic for PesaPal fulfillment.
 * This service can be called safely from both API Routes and Server Actions.
 */

export async function processFulfillment(orderTrackingId: string, merchantReference: string) {
  try {
    console.log(`[PaymentService] Verifying order: ${orderTrackingId}`);
    
    // Call the Edge Function which contains the actual PesaPal API check
    const { data, error } = await supabase.functions.invoke('payment-ops', {
      body: { 
        action: 'fulfill',
        orderTrackingId,
        merchantReference
      }
    });

    if (error) {
      console.error(`[PaymentService Error] Order ${orderTrackingId}:`, error.message);
      return { success: false, error: error.message };
    }
    
    return data || { success: false, error: "Empty response from verification service." };
  } catch (err: any) { 
    console.error(`[PaymentService Crash] Order ${orderTrackingId}:`, err);
    return { success: false, error: err.message || "Critical verification failure." }; 
  }
}
