"use client"

import { useState, Suspense, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/firebase/auth/use-user"
import { Button } from "@/components/ui/button"
import { 
  ChevronLeft, 
  Loader2, 
  History, 
  CheckCircle2,
  Zap,
  ShieldCheck
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { initiatePesaPalPayment, fulfillPaymentAction } from "@/app/actions/payment-actions"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"

const PACKAGES = [
  { amount: 500, price: 80.0 },
  { amount: 1000, price: 120.0 },
  { amount: 2000, price: 230.0 },
  { amount: 5000, price: 550.0 },
  { amount: 10000, price: 1000.0 },
  { amount: 20000, price: 1800.0 },
]

function RechargeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading, isInitialized } = useUser()
  const { toast } = useToast()
  
  const [selectedPackage, setSelectedPackage] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null)
  const [isFulfilling, setIsFulfilling] = useState(false)
  const [fulfillmentSuccess, setFulfillmentSuccess] = useState(false)
  
  const [currentCoins, setCurrentCoins] = useState<number | null>(null)
  
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null)
  const successTriggeredRef = useRef(false)

  // 1. FAST REALTIME PULSE
  // Listens for the balance increment directly from the database (via IPN or manual fulfill)
  useEffect(() => {
    if (!user?.id) return
    
    const fetchData = async () => {
      const { data: b } = await supabase.from('balances').select('coins').eq('user_id', user.id).single()
      if (b) setCurrentCoins(Number(b.coins) || 0)
    }
    fetchData()

    const channel = supabase.channel(`recharge-pulse:${user.id}`)
      .on('postgres_changes', { 
        event: 'UPDATE', 
        table: 'balances', 
        filter: `user_id=eq.${user.id}` 
      }, (payload) => {
        const newBal = Number(payload.new.coins) || 0
        // If balance increases, we know fulfillment happened
        if (currentCoins !== null && newBal > currentCoins && !successTriggeredRef.current) {
          successTriggeredRef.current = true
          setFulfillmentSuccess(true)
          setIsFulfilling(false)
          if (pollTimerRef.current) clearInterval(pollTimerRef.current)
          toast({ title: "Coins Added!", description: "Balance updated successfully." })
        }
      })
      .subscribe()

    return () => { 
      supabase.removeChannel(channel)
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [user?.id, currentCoins])

  // 2. AGGRESSIVE AUTO-VERIFY
  // If we return to the app with OrderTrackingId, start checking immediately
  useEffect(() => {
    const orderId = searchParams.get("OrderTrackingId") || searchParams.get("orderTrackingId")
    const merchantRef = searchParams.get("OrderMerchantReference") || searchParams.get("orderMerchantReference")

    if (orderId && merchantRef && !fulfillmentSuccess && !successTriggeredRef.current) {
      setIsFulfilling(true)
      
      const verify = async () => {
        if (successTriggeredRef.current) return
        const res = await fulfillPaymentAction(orderId, merchantRef)
        if (res.success && !successTriggeredRef.current) {
          successTriggeredRef.current = true
          setFulfillmentSuccess(true)
          setIsFulfilling(false)
        }
      }

      // First check immediate
      verify()
      // Then poll every 2 seconds for 1 minute
      pollTimerRef.current = setInterval(verify, 2000)
      setTimeout(() => { if (pollTimerRef.current) clearInterval(pollTimerRef.current) }, 60000)
    }

    return () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current) }
  }, [searchParams, fulfillmentSuccess])

  const handlePayment = async () => {
    const pkg = PACKAGES.find(p => p.amount === selectedPackage)
    if (!user || !pkg) return
    setLoading(true)
    try {
      const result = await initiatePesaPalPayment(pkg.price, {
        uid: user.id,
        email: user.email || `user_${user.id}@qivo.app`,
        name: user.user_metadata?.full_name || "QIVO User"
      })
      if (result.success && result.redirect_url) {
        setPaymentUrl(result.redirect_url)
      } else {
        toast({ variant: "destructive", title: "Error", description: result.error })
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Connection failed." })
    } finally {
      setLoading(false)
    }
  }

  if (authLoading || !isInitialized) return <div className="flex-1 flex items-center justify-center h-screen bg-white"><Loader2 className="animate-spin text-[#00A2FF]" /></div>

  // FULFILLMENT SUCCESS VIEW
  if (isFulfilling || fulfillmentSuccess || searchParams.get("OrderTrackingId")) {
    return (
      <div className="flex-1 bg-white min-h-screen flex flex-col items-center justify-center p-8 space-y-10 animate-in fade-in duration-300">
        <div className="relative">
          <div className="w-32 h-32 border-4 border-blue-50 rounded-full flex items-center justify-center">
            {fulfillmentSuccess ? (
              <CheckCircle2 className="w-20 h-20 text-green-500 animate-in zoom-in" />
            ) : (
              <Zap className="w-12 h-12 text-[#00A2FF] animate-pulse" />
            )}
          </div>
          {!fulfillmentSuccess && (
            <div className="w-32 h-32 border-4 border-[#00A2FF] border-t-transparent rounded-full animate-spin absolute inset-0" />
          )}
        </div>
        <div className="text-center space-y-2">
          <h2 className={cn("text-3xl font-black italic tracking-tighter uppercase", fulfillmentSuccess ? "text-green-600" : "text-black")}>
            {fulfillmentSuccess ? "COINS ADDED!" : "VERIFYING..."}
          </h2>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.4em]">{fulfillmentSuccess ? "FULFILLMENT COMPLETE" : "STAY ON THIS PAGE"}</p>
        </div>
        {fulfillmentSuccess && (
          <Button onClick={() => router.replace("/profile")} className="rounded-full bg-black text-white font-black uppercase text-[10px] tracking-widest h-16 px-12 shadow-2xl animate-in slide-in-from-bottom-4">Enter Wallet</Button>
        )}
      </div>
    )
  }

  return (
    <div className="flex-1 bg-[#F9FAFB] min-h-screen flex flex-col select-none">
      <header className="px-4 h-16 flex items-center justify-between bg-white border-b sticky top-0 z-50">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full"><ChevronLeft className="w-6 h-6 text-black" /></Button>
        <h1 className="text-sm font-black text-black uppercase tracking-widest">My Wallet</h1>
        <Button variant="ghost" size="icon" onClick={() => router.push("/coin-history")} className="rounded-full"><History className="w-5 h-5 text-black" /></Button>
      </header>

      <main className="flex-1 overflow-y-auto no-scrollbar pb-32">
        <div className="px-6 pt-8 space-y-8">
          <div className="bg-gradient-to-br from-[#00A2FF] to-[#0066CC] rounded-[2.5rem] p-8 shadow-2xl text-white relative overflow-hidden">
            <Zap className="absolute -right-4 -bottom-4 w-32 h-32 opacity-10 rotate-12" />
            <div className="relative z-10">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-70">Current Balance</p>
              <div className="flex items-center gap-4 mt-1"><span className="text-6xl font-black tracking-tighter">{currentCoins ?? "..."}</span><span className="text-xs font-bold opacity-60 uppercase tracking-widest">Coins</span></div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <ShieldCheck className="w-4 h-4 text-[#00A2FF]" />
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Select Package</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {PACKAGES.map((p) => (
                <div 
                  key={p.amount} 
                  onClick={() => setSelectedPackage(p.amount)} 
                  className={cn(
                    "relative rounded-[2rem] h-32 flex flex-col items-center justify-center p-4 transition-all active:scale-95 cursor-pointer border-2", 
                    selectedPackage === p.amount ? "bg-white border-[#00A2FF] shadow-xl" : "bg-white border-transparent shadow-sm"
                  )}
                >
                  <span className="text-2xl font-black text-black tracking-tighter">{p.amount}</span>
                  <div className="bg-gray-50 px-3 py-1 rounded-full border border-gray-100 mt-2">
                    <span className="text-[10px] font-black text-[#00A2FF]">KES {p.price}</span>
                  </div>
                  {selectedPackage === p.amount && (
                    <div className="absolute -top-2 -right-2 bg-[#00A2FF] rounded-full p-1 shadow-lg">
                      <CheckCircle2 className="w-4 h-4 text-white" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      <footer className="fixed bottom-0 inset-x-0 bg-white/80 backdrop-blur-xl p-6 border-t z-50">
        <Button 
          disabled={loading || !selectedPackage} 
          className="w-full h-16 rounded-full bg-[#00A2FF] hover:bg-[#0081CC] text-white font-black uppercase tracking-[0.2em] text-sm shadow-2xl active:scale-95 transition-all" 
          onClick={handlePayment}
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : selectedPackage ? `Pay KES ${PACKAGES.find(p => p.amount === selectedPackage)?.price}` : "Select a Package"}
        </Button>
      </footer>

      {/* SECURE CHECKOUT IFRAME MODAL */}
      <Dialog open={!!paymentUrl} onOpenChange={(open) => !open && setPaymentUrl(null)}>
        <DialogContent className="max-w-none w-full h-[100dvh] p-0 border-none bg-white rounded-none flex flex-col z-[9999] [&>button]:hidden">
          <DialogTitle className="sr-only">Secure Checkout</DialogTitle>
          <div className="h-14 bg-white border-b flex items-center px-4">
             <Button variant="ghost" size="sm" onClick={() => setPaymentUrl(null)} className="rounded-full font-bold text-[10px] uppercase gap-2">
               <ChevronLeft className="w-4 h-4" /> Cancel
             </Button>
             <div className="flex-1 flex justify-center items-center gap-2">
                <Zap className="w-4 h-4 text-green-500" />
                <span className="text-[9px] font-black uppercase tracking-widest">Secure Checkout</span>
             </div>
             <div className="w-20" />
          </div>
          <div className="flex-1 relative bg-gray-50">
            {paymentUrl && (
              <iframe 
                src={paymentUrl} 
                className="absolute inset-0 w-full h-full border-none" 
                title="Checkout" 
                allow="payment" 
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function RechargePage() { return <Suspense fallback={<div className="h-screen bg-white" />}><RechargeContent /></Suspense> }
