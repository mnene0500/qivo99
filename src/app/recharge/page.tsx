"use client"

import { useState, Suspense, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { doc } from "firebase/firestore"
import { ref, onValue, off } from "firebase/database"
import { useFirestore, useUser, useDoc, useMemoFirebase, useDatabase } from "@/firebase"
import { Button } from "@/components/ui/button"
import { 
  ChevronLeft, 
  CreditCard, 
  Loader2, 
  History, 
  Users, 
  ArrowRight,
  CheckCircle2
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { initiatePesaPalPayment, fulfillPaymentAction } from "@/app/actions/payment-actions"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"

function CoinIcon({ className }: { className?: string }) {
  return (
    <div className={cn("w-10 h-10 rounded-full bg-[#FFD600] flex items-center justify-center shadow-sm", className)}>
      <span className="text-white font-bold text-xl italic drop-shadow-sm">S</span>
    </div>
  )
}

const PACKAGES = [
  { amount: 200, price: 1.0 }, 
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
  const { user } = useUser()
  const db = useFirestore()
  const rtdb = useDatabase()
  const { toast } = useToast()
  
  const [selectedPackage, setSelectedPackage] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null)
  const [isFulfilling, setIsFulfilling] = useState(false)
  
  const [currentCoins, setCurrentCoins] = useState(() => {
    if (typeof window !== 'undefined' && user?.uid) {
      const cached = localStorage.getItem(`balance_cache_${user.uid}`)
      if (cached) {
        try {
          return JSON.parse(cached).coins || 0
        } catch (e) {
          return 0
        }
      }
    }
    return 0
  })

  const userRef = useMemoFirebase(() => user?.uid ? doc(db, "users", user.uid) : null, [db, user?.uid])
  const { data: profile } = useDoc<any>(userRef)

  // INSTANT FULFILLMENT ON REDIRECT
  useEffect(() => {
    const orderId = searchParams.get("OrderTrackingId");
    const merchantRef = searchParams.get("OrderMerchantReference");
    
    if (orderId && merchantRef) {
      const runFulfillment = async () => {
        setIsFulfilling(true);
        try {
          const res = await fulfillPaymentAction(orderId, merchantRef);
          if (res.success) {
            toast({ 
              title: "Payment Successful", 
              description: `Successfully credited ${res.coins || 'your'} coins!`,
            });
            // Give it a moment for RTDB sync then go to profile
            setTimeout(() => router.replace("/profile"), 2000);
          } else {
            // Still redirect but maybe it's still processing in background
            router.replace("/profile");
          }
        } catch (e) {
          router.replace("/profile");
        } finally {
          setIsFulfilling(false);
        }
      };
      runFulfillment();
    }
  }, [searchParams, router, toast]);

  // REAL-TIME BALANCE LISTENER
  useEffect(() => {
    if (!user?.uid) return
    
    const balanceRef = ref(rtdb, `balances/${user.uid}/coins`)
    const unsubscribe = onValue(balanceRef, (snapshot) => {
      if (snapshot.exists()) {
        const coins = snapshot.val() || 0
        setCurrentCoins(coins)
        
        const cached = localStorage.getItem(`balance_cache_${user.uid}`)
        const balanceData = cached ? JSON.parse(cached) : { diamonds: 0 }
        localStorage.setItem(`balance_cache_${user.uid}`, JSON.stringify({ ...balanceData, coins }))
      }
    })

    return () => off(balanceRef, 'value', unsubscribe)
  }, [user?.uid, rtdb])

  const handlePayment = async () => {
    const pkg = PACKAGES.find(p => p.amount === selectedPackage)
    if (!user || !profile || !pkg) return
    setLoading(true)
    try {
      const result = await initiatePesaPalPayment(pkg.price, {
        uid: user.uid,
        email: user.email || `user_${user.uid}@qivo.app`,
        name: profile.name || "QIVO User"
      })
      if (result.success && result.redirect_url) {
        setPaymentUrl(result.redirect_url)
      } else {
        toast({ variant: "destructive", title: "Payment Error", description: result.error || "Could not initiate payment." })
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "System Error", description: err.message })
    } finally {
      setLoading(false)
    }
  }

  if (isFulfilling) {
    return (
      <div className="flex-1 bg-white min-h-screen flex flex-col items-center justify-center p-8 space-y-8 animate-in fade-in duration-500">
        <div className="relative">
          <div className="w-24 h-24 border-4 border-blue-50 rounded-full" />
          <div className="w-24 h-24 border-4 border-[#00A2FF] border-t-transparent rounded-full animate-spin absolute inset-0" />
          <CheckCircle2 className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 text-[#00A2FF] opacity-20" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-black text-black uppercase tracking-tighter">Confirming...</h2>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.3em] animate-pulse">Syncing with PesaPal Secure API</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 bg-white min-h-screen flex flex-col select-none">
      <header className="px-4 h-16 flex items-center justify-between border-b bg-white sticky top-0 z-50">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full">
          <ChevronLeft className="w-6 h-6 text-black" />
        </Button>
        <h1 className="text-base font-black text-black uppercase tracking-widest">My Wallet</h1>
        <Button variant="ghost" size="icon" onClick={() => router.push("/coin-history")} className="rounded-full">
          <History className="w-5 h-5 text-black" />
        </Button>
      </header>

      <main className="flex-1 px-6 pt-8 pb-32">
        <div className="space-y-10">
          <div className="space-y-1">
             <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Available Coins</h2>
             <div className="flex items-center gap-4 py-6 bg-gray-50/80 rounded-[2.5rem] px-8 border border-gray-100 shadow-inner">
                <CoinIcon className="w-16 h-14" />
                <span className="text-6xl font-black text-black tracking-tighter">
                  {currentCoins}
                </span>
             </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Select Package</h2>
            <div className="grid grid-cols-2 gap-3">
              {PACKAGES.map((p) => (
                <div 
                  key={p.amount} 
                  onClick={() => setSelectedPackage(p.amount)} 
                  className={cn(
                    "rounded-[2.5rem] border-2 h-32 flex flex-col items-center justify-center p-4 relative transition-all active:scale-95 cursor-pointer shadow-sm", 
                    selectedPackage === p.amount ? "border-[#00AEFF] bg-blue-50/50" : "border-gray-50 bg-white"
                  )}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <CoinIcon className="w-6 h-6" />
                    <span className={cn("text-xl font-black", selectedPackage === p.amount ? "text-[#00AEFF]" : "text-black")}>{p.amount}</span>
                  </div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">KES {p.price}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4">
            <Button 
              variant="outline" 
              onClick={() => router.push('/coin-sellers')}
              className="w-full h-20 rounded-[2rem] border-dashed border-2 border-blue-100 bg-blue-50/20 text-blue-600 font-bold uppercase tracking-[0.15em] text-[10px] gap-3 group"
            >
              <Users className="w-5 h-5" /> 
              Certified Coin Sellers
              <ArrowRight className="w-4 h-4 ml-auto opacity-40 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </div>
      </main>

      <footer className="fixed bottom-0 inset-x-0 bg-white/80 backdrop-blur-lg p-6 border-t z-50">
        <Button 
          disabled={loading || !selectedPackage} 
          className="w-full h-16 rounded-full bg-[#00A2FF] hover:bg-[#0081CC] text-white font-black uppercase tracking-widest text-sm shadow-2xl shadow-blue-100 active:scale-95 transition-all" 
          onClick={handlePayment}
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
            <div className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Pay KES {PACKAGES.find(p => p.amount === selectedPackage)?.price}
            </div>
          )}
        </Button>
      </footer>

      <Dialog open={!!paymentUrl} onOpenChange={(open) => !open && setPaymentUrl(null)}>
        <DialogContent className="max-w-none w-full h-[100dvh] p-0 border-none bg-white rounded-none flex flex-col overflow-hidden z-[9999] [&>button]:hidden animate-in slide-in-from-bottom duration-500">
          <DialogTitle className="sr-only">Secure Payment Checkout</DialogTitle>
          
          <div className="flex-1 relative bg-gray-50">
            {paymentUrl && (
              <iframe 
                src={paymentUrl} 
                className="absolute inset-0 w-full h-full border-none"
                title="Payment Checkout"
                allow="payment"
              />
            )}
            
            <div className="absolute inset-0 -z-10 flex flex-col items-center justify-center bg-white space-y-6">
              <div className="relative">
                <div className="w-20 h-20 border-4 border-blue-50 rounded-full" />
                <div className="w-20 h-20 border-4 border-[#00A2FF] border-t-transparent rounded-full animate-spin absolute inset-0" />
              </div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] animate-pulse">Initialising Security...</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function RechargePage() { return <Suspense fallback={null}><RechargeContent /></Suspense> }
