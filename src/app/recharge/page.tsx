
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
  AlertCircle,
  ShieldCheck
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { initiatePesaPalPayment, verifyPaymentAction } from "@/app/actions/payment-actions"

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PACKAGES = [
  { amount: 500, price: 80.0 },
  { amount: 1000, price: 120.0 },
  { amount: 2000, price: 230.0 },
  { amount: 5000, price: 550.0 },
  { amount: 10000, price: 1000.0 },
  { amount: 20000, price: 1800.0 },
  { amount: 200, price: 1.0 } // Test Package
]

function RechargeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading, isInitialized } = useUser()
  const { toast } = useToast()
  
  const [selectedPackage, setSelectedPackage] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [fulfillmentSuccess, setFulfillmentSuccess] = useState(false)
  const [currentCoins, setCurrentCoins] = useState<number | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  
  // COUNTDOWN LOGIC
  const orderTrackingId = searchParams.get("OrderTrackingId") || searchParams.get("orderTrackingId")
  const [showVerifying, setShowVerifying] = useState(!!orderTrackingId)
  const [countdown, setCountdown] = useState(5)
  
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null)
  const successTriggeredRef = useRef(false)

  const handleRedirectHome = () => {
    successTriggeredRef.current = true;
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    router.replace('/profile');
  };

  // 1. Instant Real-time listener for balance update
  useEffect(() => {
    if (!user?.id) return
    
    const fetchBalance = async () => {
      const { data: b } = await supabase.from('balances').select('coins').eq('user_id', user.id).maybeSingle()
      if (b) setCurrentCoins(Number(b.coins) || 0)
    }
    fetchBalance()

    const channel = supabase.channel(`recharge-live-sync:${user.id}`)
      .on('postgres_changes', { event: 'UPDATE', table: 'balances', filter: `user_id=eq.${user.id}` }, (payload) => {
        const newBal = Number(payload.new.coins) || 0
        if (currentCoins !== null && newBal > currentCoins && !successTriggeredRef.current) {
          setFulfillmentSuccess(true)
          setShowVerifying(false)
          toast({ title: "Recharge Successful!", description: "Your coins have arrived." })
          setTimeout(handleRedirectHome, 2000);
        }
      })
      .subscribe()

    return () => { 
      supabase.removeChannel(channel)
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [user?.id, currentCoins])

  // 2. Countdown Timer
  useEffect(() => {
    if (showVerifying && countdown > 0) {
      const timer = setTimeout(() => setCountdown(prev => prev - 1), 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0) {
      setShowVerifying(false);
    }
  }, [showVerifying, countdown]);

  // 3. Poll verify action silently in the background
  useEffect(() => {
    if (orderTrackingId && user?.id && !fulfillmentSuccess && !successTriggeredRef.current) {
      const runVerification = async () => {
        if (successTriggeredRef.current) return;
        try {
          const res = await verifyPaymentAction(orderTrackingId, user.id);
          if (res.success && res.coins_added) {
            // Real-time listener handles the state change
          } else if (res.error && !res.error.toLowerCase().includes("not completed")) {
            // Only stop on actual fatal errors, ignore "pending" status
            console.warn("Poll status:", res.error);
          }
        } catch (err) {}
      };
      runVerification();
      pollTimerRef.current = setInterval(runVerification, 6000); 
    }
    return () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current); };
  }, [orderTrackingId, user?.id, fulfillmentSuccess]);

  const handlePayment = async () => {
    const pkg = PACKAGES.find(p => p.amount === selectedPackage)
    if (!user || !pkg) return
    setLoading(true)
    setErrorMessage(null)
    try {
      const result = await initiatePesaPalPayment(pkg.price, {
        uid: user.id,
        email: user.email || `user_${user.id}@qivo.app`,
        name: user.user_metadata?.full_name || "QIVO User"
      })
      if (result.success && result.redirect_url) {
        window.location.href = result.redirect_url;
      } else {
        setErrorMessage(result.error || "Gateway connection failed.");
        setLoading(false)
      }
    } catch (err) {
      setErrorMessage("Critical connection failure.")
      setLoading(false)
    }
  }

  if (authLoading || !isInitialized) return <div className="flex-1 flex items-center justify-center h-screen bg-white"><Loader2 className="animate-spin text-[#00A2FF]" /></div>

  // COUNTDOWN SCREEN
  if (showVerifying && !fulfillmentSuccess) {
    return (
      <div className="flex-1 bg-white min-h-screen flex flex-col items-center justify-center p-8 space-y-12 animate-in fade-in duration-500">
        <div className="relative">
          <div className="w-40 h-40 border-4 border-blue-50 rounded-full flex items-center justify-center">
             <Loader2 className="w-32 h-32 text-[#00A2FF] animate-spin opacity-20" />
             <div className="absolute inset-0 flex items-center justify-center flex-col">
                <span className="text-4xl font-black text-black leading-none">{countdown}</span>
                <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest mt-1">SEC</span>
             </div>
          </div>
          <div className="absolute -bottom-4 -right-4 bg-green-500 p-3 rounded-2xl shadow-xl border-4 border-white animate-bounce">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-black text-black tracking-tight uppercase">Confirming...</h2>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.4em] max-w-[240px] leading-relaxed">
            Talking to gateway. You'll be back in the store in a moment.
          </p>
        </div>
      </div>
    )
  }

  // SUCCESS / ERROR SCREEN
  if (fulfillmentSuccess || errorMessage) {
    return (
      <div className="flex-1 bg-white min-h-screen flex flex-col items-center justify-center p-8 space-y-10 animate-in fade-in duration-300">
        <div className="relative">
          <div className="w-32 h-32 border-4 border-blue-50 rounded-full flex items-center justify-center">
            {fulfillmentSuccess ? <CheckCircle2 className="w-20 h-20 text-green-500 animate-in zoom-in" /> : <AlertCircle className="w-16 h-16 text-red-500" />}
          </div>
        </div>
        <div className="text-center space-y-2">
          <h2 className={cn("text-3xl font-black italic tracking-tighter uppercase", fulfillmentSuccess ? "text-green-600" : "text-red-500")}>
            {fulfillmentSuccess ? "DONE!" : "FAILED"}
          </h2>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.4em] max-w-[280px]">
            {fulfillmentSuccess ? "RELOADING PROFILE" : errorMessage}
          </p>
        </div>
        {errorMessage && <Button onClick={() => setErrorMessage(null)} className="rounded-full bg-black text-white font-bold uppercase tracking-widest px-8 h-14">Try Again</Button>}
      </div>
    )
  }

  return (
    <div className="flex-1 bg-[#F9FAFB] min-h-screen flex flex-col select-none">
      <header className="px-4 h-16 flex items-center justify-between bg-white border-b sticky top-0 z-50">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full"><ChevronLeft className="w-6 h-6 text-black" /></Button>
        <h1 className="text-sm font-black text-black uppercase tracking-widest">Recharge</h1>
        <Button variant="ghost" size="icon" onClick={() => router.push("/coin-history")} className="rounded-full"><History className="w-5 h-5 text-black" /></Button>
      </header>
      <main className="flex-1 overflow-y-auto no-scrollbar pb-32">
        <div className="px-6 pt-8 space-y-8">
          <div className="bg-gradient-to-br from-[#00A2FF] to-[#0066CC] rounded-[2.5rem] p-8 shadow-2xl text-white relative overflow-hidden">
            <Zap className="absolute -right-4 -bottom-4 w-32 h-32 opacity-10 rotate-12" />
            <div className="relative z-10">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-70">Balance</p>
              <div className="flex items-center gap-4 mt-1"><span className="text-6xl font-black tracking-tighter">{currentCoins ?? "..."}</span><span className="text-xs font-bold opacity-60 uppercase tracking-widest">Coins</span></div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {PACKAGES.map((p) => (
              <div key={p.amount} onClick={() => setSelectedPackage(p.amount)} className={cn("relative rounded-[2rem] h-32 flex flex-col items-center justify-center p-4 transition-all active:scale-95 cursor-pointer border-2", selectedPackage === p.amount ? "bg-white border-[#00A2FF] shadow-xl" : "bg-white border-transparent shadow-sm")}>
                <span className="text-2xl font-black text-black tracking-tighter">{p.amount}</span>
                <div className="bg-gray-50 px-3 py-1 rounded-full border border-gray-100 mt-2"><span className="text-[10px] font-black text-[#00A2FF]">KES {p.price}</span></div>
                {selectedPackage === p.amount && <div className="absolute -top-2 -right-2 bg-[#00A2FF] rounded-full p-1 shadow-lg"><CheckCircle2 className="w-4 h-4 text-white" /></div>}
              </div>
            ))}
          </div>
        </div>
      </main>
      <footer className="fixed bottom-0 inset-x-0 bg-white/80 backdrop-blur-xl p-6 border-t z-50">
        <Button disabled={loading || !selectedPackage} className="w-full h-16 rounded-full bg-[#00A2FF] text-white font-black uppercase tracking-[0.2em] text-sm shadow-2xl active:scale-95 transition-all" onClick={handlePayment}>
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : selectedPackage ? `Pay KES ${PACKAGES.find(p => p.amount === selectedPackage)?.price}` : "Select Package"}
        </Button>
      </footer>
    </div>
  )
}

export default function RechargePage() { return <Suspense fallback={<div className="h-screen bg-white" />}><RechargeContent /></Suspense> }
