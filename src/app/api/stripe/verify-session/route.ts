import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabase";

function getStripe() {
  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret) {
    throw new Error("Missing STRIPE_SECRET_KEY in environment.");
  }
  return new Stripe(stripeSecret, { apiVersion: "2023-11-15" });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { sessionId } = body;
  if (!sessionId) {
    return NextResponse.json({ success: false, error: "Missing sessionId." }, { status: 400 });
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent"]
    });

    if (session.payment_status !== "paid") {
      return NextResponse.json({ success: false, error: "Session not paid yet." }, { status: 400 });
    }

    const metadata = session.metadata || {};
    const userId = metadata.user_id;
    const coins = Number(metadata.coins || 0);
    const amount = Number((session.amount_total || 0) / 100);

    if (!userId || !coins) {
      return NextResponse.json({ success: false, error: "Invalid session metadata." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: existing } = await supabase.from("processed_payments").select("*").eq("order_tracking_id", sessionId).maybeSingle();
    if (existing) {
      return NextResponse.json({ success: true, coins });
    }

    const { error: rpcErr } = await supabase.rpc("increment_coins", { p_user_id: userId, p_amount: coins });
    if (rpcErr) {
      console.error("Stripe verify error", rpcErr);
      return NextResponse.json({ success: false, error: "Unable to credit coins." }, { status: 500 });
    }

    await Promise.all([
      supabase.from("processed_payments").insert({
        order_tracking_id: sessionId,
        user_id: userId,
        amount,
        coins,
        payment_method: "Stripe"
      }),
      supabase.from('coin_history').insert({
        user_id: userId,
        amount: coins,
        type: "purchase",
        description: `Stripe Top-up: ${amount} KES`,
        timestamp: Date.now()
      }),
      supabase.from("pending_payments").update({ status: "completed" }).eq("order_id", sessionId)
    ]);

    return NextResponse.json({ success: true, coins });
  } catch (err: any) {
    console.error("Stripe verify session error", err.message || err);
    return NextResponse.json({ success: false, error: err.message || "Verification failed." }, { status: 500 });
  }
}
