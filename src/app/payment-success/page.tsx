
"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { CheckCircle2, Loader2, Coins, Home, RefreshCw, AlertCircle } from "lucide-react"
import { verifyPaymentAction } from "@/app/actions/payment-actions"
import { useToast } from "@/hooks/use-toast"

function PaymentSuccessContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { toast } = useToast()
  
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying')
  const [coinsAdded, setCoinsAdded] = useState(0)

  const trackingId = searchParams.get('OrderTrackingId')
  const merchantRef = searchParams.get('OrderMerchantReference')

  const verify = async () => {
    if (!trackingId || !merchantRef) {
      setStatus('error')
      return
    }

    try {
      const res = await verifyPaymentAction(trackingId, merchantRef)
      if (res.success) {
        setStatus('success')
        setCoinsAdded(res.coins || 0)
        toast({ title: "Purchase Confirmed!", description: "Coins have been added to your wallet." })
      } else {
        setStatus('error')
      }
    } catch (err) {
      setStatus('error')
    }
  }

  useEffect(() => {
    verify()
  }, [trackingId, merchantRef])

  return (
    <div className="flex-1 bg-white min-h-screen flex flex-col items-center justify-center p-8 text-center space-y-8 animate-in fade-in duration-500">
      {status === 'verifying' && (
        <div className="space-y-6">
          <div className="relative mx-auto w-24 h-24">
            <div className="absolute inset-0 border-4 border-blue-50 rounded-[2.5rem] animate-pulse" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-10 h-10 text-[#00A2FF] animate-spin" />
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-black uppercase tracking-tighter">Securing Transaction</h2>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Communicating with PesaPal Gateway...</p>
          </div>
        </div>
      )}

      {status === 'success' && (
        <div className="space-y-8 animate-in zoom-in-95 duration-500">
          <div className="w-24 h-24 bg-green-50 rounded-[2.5rem] flex items-center justify-center mx-auto shadow-xl shadow-green-100">
            <CheckCircle2 className="w-12 h-12 text-green-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-3xl font-black text-black uppercase tracking-tighter">Payment Received!</h2>
            <div className="flex items-center justify-center gap-2 text-[#00A2FF] bg-blue-50 py-2 px-6 rounded-full w-fit mx-auto mt-4 border border-blue-100 shadow-sm">
              <Coins className="w-5 h-5 fill-current" />
              <span className="text-lg font-black">+{coinsAdded} Coins</span>
            </div>
          </div>
          <Button 
            onClick={() => router.replace('/home')}
            className="w-full max-w-xs h-16 rounded-full bg-black text-white font-black uppercase tracking-widest text-sm shadow-xl active:scale-95 transition-all"
          >
            <div className="flex items-center gap-2"><Home className="w-5 h-5" /> Back to Discover</div>
          </Button>
        </div>
      )}

      {status === 'error' && (
        <div className="space-y-8 animate-in shake duration-500">
          <div className="w-24 h-24 bg-red-50 rounded-[2.5rem] flex items-center justify-center mx-auto shadow-xl shadow-red-100">
            <AlertCircle className="w-12 h-12 text-red-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-3xl font-black text-black uppercase tracking-tighter">Update Pending</h2>
            <p className="text-sm font-medium text-gray-400 px-8">The gateway hasn't confirmed completion yet. If money was deducted, it will reflect in 5-10 minutes.</p>
          </div>
          <div className="flex flex-col gap-4 w-full max-w-xs mx-auto">
            <Button onClick={verify} className="w-full h-16 rounded-full bg-[#00A2FF] text-white font-black uppercase tracking-widest text-sm shadow-xl">
              <div className="flex items-center gap-2"><RefreshCw className="w-5 h-5" /> Retry Sync</div>
            </Button>
            <Button variant="ghost" onClick={() => router.replace('/home')} className="text-xs font-bold text-gray-400 uppercase tracking-widest">
              Check Later
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={<div className="flex-1 bg-white min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-[#00A2FF]" /></div>}>
      <PaymentSuccessContent />
    </Suspense>
  )
}
