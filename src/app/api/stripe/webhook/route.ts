import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "edge";

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

if (!stripeSecret) {
  throw new Error("Missing STRIPE_SECRET_KEY in environment.");
}
if (!stripeWebhookSecret) {
  throw new Error("Missing STRIPE_WEBHOOK_SECRET in environment.");
}

const stripe = new Stripe(stripeSecret, { apiVersion: "2023-11-15" });

export async function POST(request: Request) {
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, stripeWebhookSecret);
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook error: ${err.message}` }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const metadata = session.metadata || {};
    const userId = metadata.user_id;
    const coins = Number(metadata.coins || 0);
    const sessionId = session.id;
    const amount = Number((session.amount_total || 0) / 100);

    if (!userId || !coins || !sessionId) {
      return NextResponse.json({ error: "Invalid session metadata." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: existing } = await supabase.from("processed_payments").select("*").eq("order_tracking_id", sessionId).maybeSingle();
    if (existing) {
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const { error: rpcErr } = await supabase.rpc("increment_coins", { p_user_id: userId, p_amount: coins });
    if (rpcErr) {
      console.error("Stripe credit error", rpcErr);
      return NextResponse.json({ error: "Unable to credit coins." }, { status: 500 });
    }

    await Promise.all([
      supabase.from("processed_payments").insert({
        order_tracking_id: sessionId,
        user_id: userId,
        amount: amount,
        coins,
        payment_method: "Google Pay"
      }),
      supabase.from("coin_history").insert({
        user_id: userId,
        amount: coins,
        type: "purchase",
        description: `Stripe/Google Pay Top-up: ${amount} KES`,
        timestamp: Date.now()
      }),
      supabase.from("pending_payments").update({ status: "completed" }).eq("order_id", sessionId)
    ]);
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
