
import { NextResponse } from 'next/server';
import { PESAPAL_CONFIG } from '@/lib/pesapal-config';

/**
 * @fileOverview Diagnostic tool to help register IPN on Vercel.
 */
export async function GET() {
  const consumerKey = process.env.PESAPAL_CONSUMER_KEY;
  const consumerSecret = process.env.PESAPAL_CONSUMER_SECRET;

  if (!consumerKey || !consumerSecret) {
    return NextResponse.json({ error: "Missing Environment Variables in Vercel" }, { status: 500 });
  }

  try {
    const authRes = await fetch("https://pay.pesapal.com/v3/api/Auth/RequestToken", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consumer_key: consumerKey, consumer_secret: consumerSecret }),
    });
    const { token } = await authRes.json();

    const regRes = await fetch("https://pay.pesapal.com/v3/api/URLSetup/RegisterIPN", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ url: PESAPAL_CONFIG.IPN_URL, ipn_notification_type: "GET" }),
    });
    const regData = await regRes.json();

    return NextResponse.json({
      status: "Connected to PesaPal",
      registration: regData,
      instruction: "If registration was successful, copy the 'ipn_id' from the response above and add it to your Vercel Env as PESAPAL_IPN_ID."
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
