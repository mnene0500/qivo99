
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ChevronLeft, Coins, CheckCircle2, ShieldCheck, Loader2, MessageSquare, ExternalLink, Zap } from "lucide-react"
import { useUser } from "@/firebase/auth/use-user"
import { useToast } from "@/hooks/use-toast"
import { initiatePesaPalPayment } from "@/app/actions/payment-actions"
import { cn } from "@/lib/utils"

const PACKAGES = [
  { id: "test", label: "Test Package", coins: 500, price: 50, color: "bg-green-50", text: "text-green-600", popular: true },
  { id: "starter", label: "Starter Pack", coins: 2000, price: 200, color: "bg-blue-50", text: "text-blue-600" },
  { id: "pro", label: "Pro Value", coins: 5500, price: 500, color: "bg-purple-50", text: "text-purple-600" },
  { id: "elite", label: "Elite Bundle", coins: 12000, price: 1000, color: "bg-amber-50", text: "text-amber-600" },
]

export default function RechargePage() {
  const router = useRouter()
  const { user } = useUser()
  const { toast } = useToast()
  
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const handleBuy = async (pkg: typeof PACKAGES[0]) => {
    if (!user) {
      router.push("/auth")
      return
    }
    
    setLoadingId(pkg.id)
    try {
      const res = await initiatePesaPalPayment(user.id, pkg.price, pkg.coins)
      if (res.success && res.redirect_url) {
        window.location.href = res.redirect_url
      } else {
        toast({ variant: "destructive", title: "Gateway Error", description: res.error || "Failed to initiate payment." })
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Network Error", description: "Could not connect to payment server." })
    } finally {
      setLoadingId(null)
    }
  }

  return (
    <div className="flex-1 bg-white min-h-screen flex flex-col select-none animate-in fade-in duration-500">
      <header className="px-4 h-16 flex items-center justify-between border-b bg-white sticky top-0 z-50">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full text-black">
          <ChevronLeft className="w-6 h-6" />
        </Button>
        <h1 className="text-base font-black text-black">Recharge Coins</h1>
        <div className="w-10" />
      </header>

      <main className="flex-1 p-6 space-y-8 pb-20">
        <div className="bg-black rounded-[2.5rem] p-8 text-white relative overflow-hidden shadow-2xl">
          <Zap className="absolute -right-6 -bottom-6 w-32 h-32 text-white/5 rotate-12" />
          <div className="relative z-10 space-y-4">
            <div className="flex items-center gap-2 text-[#00A2FF]">
              <ShieldCheck className="w-5 h-5 fill-current" />
              <span className="text-[10px] font-black uppercase tracking-widest">Verified Payment System</span>
            </div>
            <h2 className="text-3xl font-black leading-tight tracking-tighter">Get QIVO Coins Instantly</h2>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em]">Secure Checkout • Instant Delivery</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {PACKAGES.map((pkg) => (
            <div 
              key={pkg.id} 
              className={cn(
                "relative group p-6 rounded-[2rem] border-2 transition-all active:scale-[0.98]",
                pkg.popular ? "border-[#00A2FF] bg-blue-50/30" : "border-gray-50 bg-white"
              )}
            >
              {pkg.popular && (
                <div className="absolute -top-3 left-6 bg-[#00A2FF] text-white px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest shadow-lg">
                  Best Value
                </div>
              )}
              
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner", pkg.color)}>
                    <Coins className={cn("w-7 h-7", pkg.text)} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-black leading-none">{pkg.coins} Coins</h3>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">{pkg.label}</p>
                  </div>
                </div>
                
                <Button 
                  onClick={() => handleBuy(pkg)}
                  disabled={!!loadingId}
                  className={cn(
                    "rounded-full px-8 h-12 font-black text-xs uppercase tracking-widest shadow-xl transition-all",
                    pkg.popular ? "bg-[#00A2FF] text-white hover:bg-blue-600" : "bg-black text-white hover:bg-gray-800"
                  )}
                >
                  {loadingId === pkg.id ? <Loader2 className="w-4 h-4 animate-spin" /> : `KES ${pkg.price}`}
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-4 pt-4">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Alternative Methods</p>
          <Button 
            onClick={() => router.push('/coin-sellers')}
            variant="outline"
            className="w-full h-16 rounded-[2rem] border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-between px-8 text-black font-black uppercase tracking-widest text-[10px] hover:bg-white hover:border-gray-300 transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="bg-white p-2 rounded-xl shadow-sm"><MessageSquare className="w-4 h-4 text-green-500" /></div>
              Buy from Certified Seller
            </div>
            <ExternalLink className="w-4 h-4 opacity-20" />
          </Button>
        </div>
      </main>

      <footer className="p-8 text-center bg-gray-50">
        <p className="text-[9px] font-medium text-gray-400 leading-relaxed uppercase tracking-widest px-6">
          By purchasing, you agree to our Virtual Currency Terms. All sales are final and non-refundable.
        </p>
      </footer>
    </div>
  )
}
