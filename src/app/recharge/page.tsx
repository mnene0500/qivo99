"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ChevronLeft, Coins, ShieldCheck, Loader2, MessageSquare, ExternalLink, Zap, History, Globe, ChevronDown, Star, Gift } from "lucide-react"
import { useUser } from "@/firebase/auth/use-user"
import { useToast } from "@/hooks/use-toast"
import { initiatePesaPalPayment } from "@/app/actions/payment-actions"
import { cn } from "@/lib/utils"
import { useBalance } from "@/lib/providers/BalanceProvider"
import { supabase } from "@/lib/supabase"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

const PACKAGES = [
  { id: "p1", label: "500", coins: 500, priceKes: 80 },
  { id: "p2", label: "1000", coins: 1000, priceKes: 120, popular: true, bonus: 50 },
  { id: "p8", label: "2000", coins: 2000, priceKes: 240 },
  { id: "p3", label: "5000", coins: 5000, priceKes: 600, bonus: 100 },
  { id: "p4", label: "7000", coins: 7000, priceKes: 800 },
  { id: "p5", label: "10000", coins: 10000, priceKes: 1000 },
  { id: "p6", label: "15000", coins: 15000, priceKes: 1500 },
  { id: "p7", label: "20000", coins: 20000, priceKes: 2000 },
]

const RATES = {
  'Kenya': { code: 'KES', rate: 1 },
  'Tanzania': { code: 'TZS', rate: 19.8 },
  'Uganda': { code: 'UGX', rate: 28.5 },
  'Rwanda': { code: 'RWF', rate: 9.8 },
  'Nigeria': { code: 'NGN', rate: 12.5 },
  'Default': { code: 'USD', rate: 0.0078 }
}

export default function RechargePage() {
  const router = useRouter()
  const { user } = useUser()
  const { toast } = useToast()
  const { coins: currentBalance } = useBalance()
  
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isPlayBillingProcessing, setIsPlayBillingProcessing] = useState(false)
  const [profile, setProfile] = useState<any>(null)
  const [manualCountry, setManualCountry] = useState<string | null>(null)
  const [isCurrencyOpen, setIsCurrencyOpen] = useState(false)
  const [bonusEligibility, setBonusEligibility] = useState({ p2: true, p3: true })

  useEffect(() => {
    if (!user?.id) return
    supabase.from('users').select('country').eq('uid', user.id).single().then(({ data }) => setProfile(data))

    const checkEligibility = async () => {
      const { data } = await supabase
        .from('processed_payments')
        .select('amount')
        .eq('user_id', user.id)
        .in('amount', [120, 600]);
      
      if (data) {
        const amounts = data.map(p => Number(p.amount));
        setBonusEligibility({
          p2: !amounts.includes(120),
          p3: !amounts.includes(600)
        });
      }
    };
    checkEligibility();
  }, [user?.id])

  const currentCountry = manualCountry || profile?.country || 'Kenya'
  const currencyInfo = RATES[currentCountry as keyof typeof RATES] || RATES['Default']
  const selectedPackage = PACKAGES.find(p => p.id === selectedId)
  const isPesaPalCountry = !['Nigeria', 'Ghana', 'South Africa'].includes(currentCountry)

  const handlePesaPalRecharge = async () => {
    if (!user) { router.push("/auth"); return; }
    if (!selectedPackage) return;
    if (!isPesaPalCountry) {
      toast({ variant: "destructive", title: "PesaPal unavailable", description: "PesaPal is not supported in your country. Use Play Billing or Coinseller instead." });
      return;
    }
    setIsProcessing(true)
    try {
      const res = await initiatePesaPalPayment(user.id, selectedPackage.priceKes, selectedPackage.coins)
      if (res.success && res.redirect_url) window.location.href = res.redirect_url
      else toast({ variant: "destructive", title: "Gateway Error" })
    } finally { setIsProcessing(false) }
  }

  const handlePlayBillingRecharge = async () => {
    if (!user) { router.push("/auth"); return; }
    if (!selectedPackage) return;
    setIsPlayBillingProcessing(true)
    try {
      router.push(`/recharge/play-billing?packageId=${selectedPackage.id}`)
    } finally {
      setIsPlayBillingProcessing(false)
    }
  }

  const formatPrice = (kes: number) => `${currencyInfo.code} ${(kes * currencyInfo.rate).toFixed(0)}`

  return (
    <div className="flex flex-col min-h-screen bg-[#F8FAFC] select-none">
      <header className="px-4 h-16 flex items-center justify-between border-b bg-white sticky top-0 z-[70]">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full text-black"><ChevronLeft className="w-6 h-6" /></Button>
          <Dialog open={isCurrencyOpen} onOpenChange={setIsCurrencyOpen}>
            <DialogTrigger asChild><Button variant="ghost" className="h-9 px-3 rounded-xl border border-gray-100 flex items-center gap-2 bg-gray-50"><Globe className="w-3.5 h-3.5 text-[#8B0000]" /><span className="text-[10px] font-black uppercase">{currencyInfo.code}</span><ChevronDown className="w-3 h-3 text-gray-400" /></Button></DialogTrigger>
            <DialogContent className="rounded-[2.5rem] p-6 max-h-[80vh] border-none shadow-2xl">
              <DialogHeader><DialogTitle className="text-sm font-black uppercase text-center">Switch Currency</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-2 mt-4 overflow-y-auto no-scrollbar">
                {Object.keys(RATES).filter(k => k !== 'Default').map((country) => (
                  <button key={country} onClick={() => { setManualCountry(country); setIsCurrencyOpen(false); }} className={cn("flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all", currentCountry === country ? "border-red-800 bg-red-50" : "border-gray-50 bg-gray-50")}><span className="text-[10px] font-black text-black">{country}</span></button>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <h1 className="text-sm font-black text-black uppercase tracking-widest">Store</h1>
        <Button variant="ghost" size="icon" onClick={() => router.push('/coin-history')} className="rounded-full text-black"><History className="w-5 h-5" /></Button>
      </header>

      <main className="flex-1 overflow-y-auto no-scrollbar pb-40 px-5">
        <div className="py-8 flex flex-col items-center gap-2">
          <div className="bg-white px-8 py-5 rounded-[2.5rem] flex items-center gap-4 shadow-xl border border-white">
            <div className="w-12 h-12 bg-yellow-50 rounded-2xl flex items-center justify-center"><Coins className='w-7 h-7 text-yellow-500 fill-yellow-500'/></div>
            <div className="flex flex-col"><span className="text-3xl font-black text-black tracking-tight">{currentBalance.toLocaleString()}</span><span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Coins Available</span></div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {PACKAGES.map((pkg) => {
            const hasBonus = pkg.bonus && bonusEligibility[pkg.id as keyof typeof bonusEligibility];
            return (
              <button key={pkg.id} onClick={() => setSelectedId(pkg.id)} className={cn("relative flex flex-col items-center justify-center p-6 rounded-[2.5rem] border-4 transition-all h-44", selectedId === pkg.id ? "border-[#8B0000] bg-white shadow-2xl shadow-red-100 scale-105 z-10" : "border-transparent bg-gray-50/50 hover:bg-white")}>
                {pkg.popular && !hasBonus && <div className="absolute -top-3 px-3 py-1 bg-orange-500 text-white text-[8px] font-black uppercase rounded-full shadow-lg flex items-center gap-1"><Star className="w-2.5 h-2.5 fill-current" /> Best Value</div>}
                {hasBonus && <div className="absolute -top-3 px-3 py-1 bg-pink-600 text-white text-[8px] font-black uppercase rounded-full shadow-lg flex items-center gap-1"><Gift className="w-2.5 h-2.5 fill-current" /> +{pkg.bonus} Bonus</div>}
                
                <div className="flex flex-col items-center gap-1 mb-3">
                  <Coins className={cn("w-8 h-8 mb-1", selectedId === pkg.id ? "text-[#8B0000] fill-current" : "text-yellow-500")} />
                  <span className="text-xl font-black text-black leading-none">{(pkg.coins).toLocaleString()}</span>
                  <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Coins</span>
                </div>
                <span className={cn("text-[11px] font-black py-1.5 px-4 rounded-full", selectedId === pkg.id ? "bg-[#8B0000] text-white" : "text-gray-400 bg-gray-100")}>{formatPrice(pkg.priceKes)}</span>
              </button>
            )
          })}
        </div>

        <Button onClick={() => router.push('/coin-sellers')} variant="ghost" className="w-full h-20 rounded-[2.5rem] bg-black mt-8 flex items-center justify-between px-8 text-white font-bold shadow-2xl">
          <div className="flex items-center gap-4">
            <div className="bg-white/10 p-2.5 rounded-2xl"><MessageSquare className="w-5 h-5 text-yellow-400 fill-current" /></div>
            <div className="text-left"><span className="block text-xs font-black uppercase tracking-widest">Coinsellers</span><span className="text-[9px] opacity-60">Local Transfer Support</span></div>
          </div>
          <ExternalLink className="w-5 h-5 text-yellow-400" />
        </Button>
      </main>

      <footer className="fixed bottom-0 inset-x-0 p-6 bg-white/95 backdrop-blur-xl border-t border-black/5 z-[80] pb-[calc(env(safe-area-inset-bottom,24px)+8px)] shadow-[0_-10px_30px_rgba(0,0,0,0.04)]">
        <div className="space-y-3">
          <Button onClick={handlePesaPalRecharge} disabled={isProcessing || !selectedId} className="w-full h-16 rounded-full bg-[#8B0000] text-white font-black tracking-widest text-sm shadow-xl active:scale-95 transition-all">
            {isProcessing ? <Loader2 className="w-6 h-6 animate-spin" /> : <div className="flex items-center gap-2"><Zap className="w-4 h-4 fill-current text-yellow-300" /> Pay with PesaPal</div>}
          </Button>
          <Button onClick={handlePlayBillingRecharge} disabled={isPlayBillingProcessing || !selectedId} className="w-full h-16 rounded-full bg-white border border-black text-black font-black tracking-widest text-sm shadow-xl active:scale-95 transition-all">
            {isPlayBillingProcessing ? <Loader2 className="w-6 h-6 animate-spin" /> : <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 fill-current text-yellow-300" /> Pay with Play Billing</div>}
          </Button>
          <Button onClick={() => router.push(selectedPackage ? `/coin-sellers?selectedPackage=${selectedPackage.label}&amount=${selectedPackage.coins}` : '/coin-sellers')} className="w-full h-16 rounded-full bg-black text-white font-black tracking-widest text-sm shadow-xl active:scale-95 transition-all">
            <div className="flex items-center gap-2"><MessageSquare className="w-4 h-4 fill-current text-yellow-300" /> Pay with Coinseller</div>
          </Button>
        </div>
        {!isPesaPalCountry && selectedPackage && (
          <p className="mt-3 text-center text-[10px] uppercase tracking-[0.2em] text-gray-400">
            PesaPal may not work in your country. Use Play Billing or Coinseller instead.
          </p>
        )}
      </footer>
    </div>
  )
}
