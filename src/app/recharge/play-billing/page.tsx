"use client"

import { useMemo } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ShieldCheck, Info, AlertCircle } from "lucide-react"

const PLAY_PRODUCTS: Record<string, { label: string; coins: number; priceKes: number; sku: string }> = {
  p1: { label: "500", coins: 500, priceKes: 80, sku: "qivo_coins_500" },
  p2: { label: "1000", coins: 1000, priceKes: 120, sku: "qivo_coins_1000" },
  p8: { label: "2000", coins: 2000, priceKes: 240, sku: "qivo_coins_2000" },
  p3: { label: "5000", coins: 5000, priceKes: 600, sku: "qivo_coins_5000" },
  p4: { label: "7000", coins: 7000, priceKes: 800, sku: "qivo_coins_7000" },
  p5: { label: "10000", coins: 10000, priceKes: 1000, sku: "qivo_coins_10000" },
  p6: { label: "15000", coins: 15000, priceKes: 1500, sku: "qivo_coins_15000" },
  p7: { label: "20000", coins: 20000, priceKes: 2000, sku: "qivo_coins_20000" }
}

export default function PlayBillingRechargePage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const packageId = searchParams.get("packageId") || "p1"
  const product = PLAY_PRODUCTS[packageId] || PLAY_PRODUCTS.p1
  const packageName = process.env.NEXT_PUBLIC_GOOGLE_PLAY_PACKAGE_NAME || "com.example.qivo"

  const playBillingInstructions = useMemo(() => {
    return [`
      Google Play Billing must be implemented in your Android native app.
      On Google Play, create a managed product with SKU ${product.sku}.
      In the native app, launch the Play Billing flow for that product.
      After purchase, send the Android purchase token to your backend at /api/play-billing/verify.
    `],
  }, [product.sku])

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6 text-black">
      <div className="max-w-2xl mx-auto space-y-6">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full text-black"><ChevronLeft className="w-6 h-6" /></Button>

        <div className="rounded-[2rem] bg-white p-8 shadow-2xl border border-gray-100">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <p className="text-xs uppercase font-black tracking-[0.35em] text-gray-400">Play Billing</p>
              <h1 className="text-3xl font-black text-black">Buy coins with Android</h1>
            </div>
            <div className="rounded-3xl bg-blue-50 p-4 text-blue-600"><ShieldCheck className="w-6 h-6" /></div>
          </div>

          <div className="space-y-4 text-sm text-gray-700">
            <p>This screen is for Google Play Billing preparation. Actual checkout happens inside the Android app.</p>
            <p className="font-semibold">Selected package:</p>
            <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xl font-black">{product.coins.toLocaleString()} Coins</p>
              <p className="text-sm text-gray-500">Price: KES {product.priceKes}</p>
              <p className="text-sm text-gray-500">Play Store SKU: <span className="font-semibold">{product.sku}</span></p>
            </div>

            <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-gray-500">Android package</p>
              <p className="mt-2 text-sm text-gray-600">{packageName}</p>
            </div>

            <div className="rounded-3xl border border-yellow-200 bg-yellow-50 p-4">
              <p className="font-semibold text-yellow-900">Important</p>
              <p className="text-sm text-yellow-900">Google Play Billing cannot be completed from a browser page. Your app must call Google Play Billing directly inside an Android APK.</p>
            </div>

            <div className="space-y-2">
              {playBillingInstructions.map((step, index) => (
                <div key={index} className="rounded-3xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
                  <p className="font-semibold">Step {index + 1}</p>
                  <p>{step}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3">
            <Button onClick={() => router.push('/recharge')} className="w-full h-16 rounded-full bg-black text-white font-black uppercase tracking-widest text-sm">
              Back to Recharge
            </Button>
            <Button variant="ghost" className="w-full h-16 rounded-full border border-gray-200 text-black font-black uppercase tracking-widest text-sm">
              Open Android App to Purchase
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
