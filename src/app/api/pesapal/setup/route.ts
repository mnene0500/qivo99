
import { NextResponse } from 'next/server';
import { registerIPN, getIpnList } from '@/app/actions/payment-actions';
import { PESAPAL_CONFIG } from '@/lib/pesapal-config';

/**
 * @fileOverview Setup tool to retrieve IPN ID from PesaPal Live.
 * Runs on the server to help admins register their domain.
 */
export async function GET() {
  try {
    // 1. Try to register the IPN for the current domain
    const registrationAttempt = await registerIPN();
    
    // 2. Fetch all currently registered IPNs for this account
    const ipnList = await getIpnList();

    // 3. Search for the IPN ID that matches our specific production callback URL
    const currentIpn = Array.isArray(ipnList) 
      ? ipnList.find((item: any) => item.url === PESAPAL_CONFIG.IPN_URL)
      : null;

    return NextResponse.json({
      message: "PesaPal Live Diagnostics",
      status: "Connected",
      target_url: PESAPAL_CONFIG.IPN_URL,
      instruction: currentIpn 
        ? `SUCCESS! Your IPN ID is found. Copy the 'recommended_ipn_id' value below into your Vercel Environment Variables as PESAPAL_IPN_ID.` 
        : `Check 'currently_registered_ipns' below.`,
      recommended_ipn_id: currentIpn?.ipn_id || "Not found yet",
      registration_attempt: registrationAttempt,
      currently_registered_ipns: ipnList
    });
  } catch (error: any) {
    return NextResponse.json({
      error: "Diagnostics Failed",
      message: error.message
    }, { status: 500 });
  }
}
