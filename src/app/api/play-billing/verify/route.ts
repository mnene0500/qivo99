import { NextResponse } from "next/server"
import { google } from "googleapis"
import { getSupabaseAdmin } from "@/lib/supabase"

const PLAY_BILLING_PRODUCTS: Record<string, { sku: string; coins: number; priceKes: number }> = {
  p1: { sku: "qivo_coins_500", coins: 500, priceKes: 80 },
  p2: { sku: "qivo_coins_1000", coins: 1000, priceKes: 120 },
  p8: { sku: "qivo_coins_2000", coins: 2000, priceKes: 240 },
  p3: { sku: "qivo_coins_5000", coins: 5000, priceKes: 600 },
  p4: { sku: "qivo_coins_7000", coins: 7000, priceKes: 800 },
  p5: { sku: "qivo_coins_10000", coins: 10000, priceKes: 1000 },
  p6: { sku: "qivo_coins_15000", coins: 15000, priceKes: 1500 },
  p7: { sku: "qivo_coins_20000", coins: 20000, priceKes: 2000 }
}

function getGoogleAuth() {
  const serviceAccountJson = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_KEY
  const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME

  if (!serviceAccountJson) {
    throw new Error("Missing GOOGLE_PLAY_SERVICE_ACCOUNT_KEY in environment.")
  }
  if (!packageName) {
    throw new Error("Missing GOOGLE_PLAY_PACKAGE_NAME in environment.")
  }

  const key = JSON.parse(serviceAccountJson)
  return new google.auth.GoogleAuth({
    credentials: key,
    scopes: ["https://www.googleapis.com/auth/androidpublisher"]
  })
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { userId, packageId, purchaseToken, productId } = body

    if (!userId || !packageId || !purchaseToken || !productId) {
      return NextResponse.json({ success: false, error: "Missing required fields." }, { status: 400 })
    }

    const packageConfig = PLAY_BILLING_PRODUCTS[packageId]
    if (!packageConfig) {
      return NextResponse.json({ success: false, error: "Invalid package ID." }, { status: 400 })
    }
    if (productId !== packageConfig.sku) {
      return NextResponse.json({ success: false, error: "Product ID mismatch." }, { status: 400 })
    }

    const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME!
    const auth = getGoogleAuth()
    const authClient = await auth.getClient()
    const androidpublisher = google.androidpublisher({ version: "v3", auth: authClient })

    const purchase = await androidpublisher.purchases.products.get({
      packageName,
      productId,
      token: purchaseToken
    })

    if (purchase.data.purchaseState !== 0) {
      return NextResponse.json({ success: false, error: "Purchase not completed." }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data: existing } = await supabase
      .from("processed_payments")
      .select("*")
      .eq("order_tracking_id", purchaseToken)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ success: true, coins: existing.coins, message: "Already credited." })
    }

    const { error: rpcErr } = await supabase.rpc("increment_coins", { p_user_id: userId, p_amount: packageConfig.coins })
    if (rpcErr) {
      console.error("Google Play Billing credit error", rpcErr)
      return NextResponse.json({ success: false, error: "Unable to credit coins." }, { status: 500 })
    }

    await Promise.all([
      supabase.from("processed_payments").insert({
        order_tracking_id: purchaseToken,
        user_id: userId,
        amount: packageConfig.priceKes,
        coins: packageConfig.coins,
        payment_method: "Play Billing"
      }),
      supabase.from("coin_history").insert({
        user_id: userId,
        amount: packageConfig.coins,
        type: "purchase",
        description: `Google Play Billing Top-up: ${packageConfig.priceKes} KES`,
        timestamp: Date.now()
      })
    ])

    return NextResponse.json({ success: true, coins: packageConfig.coins })
  } catch (error: any) {
    console.error("Play Billing verification error", error)
    return NextResponse.json({ success: false, error: error.message || "Verification failed." }, { status: 500 })
  }
}
