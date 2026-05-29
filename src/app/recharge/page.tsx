
"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { 
  ChevronLeft, 
  Coins, 
  ShieldCheck, 
  Loader2, 
  MessageSquare, 
  ExternalLink, 
  Zap, 
  Check, 
  History, 
  Info, 
  Globe, 
  ChevronDown 
} from "lucide-react"
import { useUser } from "@/firebase/auth/use-user"
import { useToast } from "@/hooks/use-toast"
import { initiatePesaPalPayment } from "@/app/actions/payment-actions"
import { cn } from "@/lib/utils"
import { useBalance } from "@/lib/providers/BalanceProvider"
import { supabase } from "@/lib/supabase"
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog"

const PACKAGES = [
  { id: "p1", label: "10", coins: 10, priceKes: 1 },
  { id: "p2", label: "500", coins: 500, priceKes: 60 },
  { id: "p3", label: "1K", coins: 1000, priceKes: 120, popular: true },
  { id: "p4", label: "1.5K", coins: 1500, priceKes: 180 },
  { id: "p5", label: "2K", coins: 2000, priceKes: 240 },
  { id: "p6", label: "5K", coins: 5000, priceKes: 600 },
]

const RATES = {
  'Kenya': { code: 'KES', rate: 1 },
  'Tanzania': { code: 'TZS', rate: 19.8 },
  'Uganda': { code: 'UGX', rate: 28.5 },
  'Rwanda': { code: 'RWF', rate: 9.8 },
  'Burundi': { code: 'BIF', rate: 22.1 },
  'South Sudan': { code: 'SSP', rate: 10.2 },
  'Ethiopia': { code: 'ETB', rate: 0.95 },
  'Somalia': { code: 'SOS', rate: 4.4 },
  'Eritrea': { code: 'ERN', rate: 0.12 },
  'Djibouti': { code: 'DJF', rate: 1.38 },
  'South Africa': { code: 'ZAR', rate: 0.15 },
  'Nigeria': { code: 'NGN', rate: 12.5 },
  'Ghana': { code: 'GHS', rate: 0.12 },
  'Egypt': { code: 'EGP', rate: 0.38 },
  'Default': { code: 'USD', rate: 0.0078 }
}

export default function RechargePage() {
  const router = useRouter()
  const { user } = useUser()
  const { toast } = useToast()
  const { coins } = useBalance()
  
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [profile, setProfile] = useState<any>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [manualCountry, setManualCountry] = useState<string | null>(null)
  const [isCurrencyOpen, setIsCurrencyOpen] = useState(false)

  useEffect(() => {
    if (!user?.id) return
    supabase.from('users').select('country').eq('uid', user.id).single().then(({ data }) => {
      setProfile(data)
      setLoadingProfile(false)
    })
  }, [user?.id])

  const currentCountry = manualCountry || profile?.country || 'Kenya'
  const currencyInfo = RATES[currentCountry as keyof typeof RATES] || RATES['Default']
  const selectedPackage = PACKAGES.find(p => p.id === selectedId)
  
  // PesaPal restricted for Merchant-only regions
  const isPesaPalCountry = !['Nigeria', 'Ghana', 'South Africa'].includes(currentCountry)

  const handleRecharge = async () => {
    if (!user) {
      router.push("/auth")
      return
    }

    if (!selectedPackage) {
      toast({ title: "Select a package first" })
      return
    }

    if (!isPesaPalCountry) {
      router.push(`/coin-sellers?selectedPackage=${selectedPackage.label}&amount=${selectedPackage.coins}`)
      return
    }
    
    setIsProcessing(true)
    try {
      const res = await initiatePesaPalPayment(user.id, selectedPackage.priceKes, selectedPackage.coins)
      if (res.success && res.redirect_url) {
        window.location.href = res.redirect_url
      } else {
        toast({ variant: "destructive", title: "Gateway Error", description: res.error || "Failed to initiate payment." })
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Network Error" })
    } finally {
      setIsProcessing(false)
    }
  }

  const formatPrice = (kes: number) => {
    const val = (kes * currencyInfo.rate).toFixed(2)
    return `${currencyInfo.code} ${val}`
  }

  return (
    <div className="flex-1 bg-white min-h-screen flex flex-col select-none animate-in fade-in duration-500">
      <header className="px-4 h-16 flex items-center justify-between border-b bg-white sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full text-black">
            <ChevronLeft className="w-6 h-6" />
          </Button>
          <Dialog open={isCurrencyOpen} onOpenChange={setIsCurrencyOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" className="h-9 px-3 rounded-xl border border-gray-100 flex items-center gap-2 bg-gray-50/50">
                <Globe className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-[10px] font-black uppercase tracking-widest">{currencyInfo.code}</span>
                <ChevronDown className="w-3 h-3 text-gray-400" />
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-[2.5rem] p-6 max-h-[80vh] flex flex-col border-none">
              <DialogHeader><DialogTitle className="text-sm font-black uppercase tracking-widest text-center">Switch Currency</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-2 mt-4 overflow-y-auto pr-1 no-scrollbar">
                {Object.keys(RATES).filter(k => k !== 'Default').map((country) => (
                  <button 
                    key={country}
                    onClick={() => {
                      setManualCountry(country);
                      setIsCurrencyOpen(false);
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all active:scale-95",
                      currentCountry === country ? "border-blue-500 bg-blue-50" : "border-gray-50 bg-gray-50"
                    )}
                  >
                    <span className="text-[10px] font-black text-black">{country}</span>
                    <span className="text-[8px] font-bold text-gray-400 mt-1">{RATES[country as keyof typeof RATES].code}</span>
                  </button>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <h1 className="text-sm font-black text-black uppercase tracking-widest">Store</h1>
        <Button variant="ghost" size="icon" onClick={() => router.push('/coin-history')} className="rounded-full text-black">
          <History className="w-5 h-5" />
        </Button>
      </header>

      <main className="flex-1 p-5 space-y-8 pb-32">
        <div className="flex flex-col items-center gap-2 pt-4">
            <div className="bg-yellow-50 px-6 py-3 rounded-full flex items-center gap-3 border border-yellow-100 shadow-sm">
                <Coins className='w-6 h-6 text-yellow-500 fill-yellow-500'/>
                <span className="text-2xl font-black text-black">{coins}</span>
            </div>
            <p className="text-[10px] font-bold text-gray-400 tracking-widest">Balance Available</p>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
             <h3 className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Select Package</h3>
             {!isPesaPalCountry && (
               <span className="text-[8px] font-bold text-[#00A2FF] bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100 flex items-center gap-1">
                 <Info className="w-2.5 h-2.5" /> Merchant Portal Only
               </span>
             )}
          </div>
          
          <div className="grid grid-cols-3 gap-3">
            {PACKAGES.map((pkg) => (
              <button 
                key={pkg.id} 
                onClick={() => setSelectedId(pkg.id)}
                className={cn(
                  "relative group flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all active:scale-95 h-32",
                  selectedId === pkg.id 
                    ? "border-[#00A2FF] bg-blue-50/50 shadow-lg shadow-blue-100" 
                    : "border-gray-50 bg-gray-50/30 hover:border-gray-100"
                )}
              >
                {selectedId === pkg.id && (
                  <div className="absolute -top-2 -right-1 bg-[#00A2FF] text-white p-1 rounded-full shadow-lg">
                    <Check className="w-3 h-3" />
                  </div>
                )}
                
                <div className="flex flex-col items-center gap-1 mb-2">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center mb-1 transition-colors",
                    selectedId === pkg.id ? "bg-[#00A2FF] text-white" : "bg-white shadow-sm text-yellow-500"
                  )}>
                    <Coins className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-black text-black leading-none">{pkg.label}</span>
                  <span className="text-[8px] font-bold text-gray-400">Coins</span>
                </div>
                
                <div className="mt-auto">
                  <span className={cn(
                    "text-[9px] font-black",
                    selectedId === pkg.id ? "text-[#00A2FF]" : "text-gray-400"
                  )}>{formatPrice(pkg.priceKes)}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <Button 
            onClick={() => router.push('/coin-sellers')}
            variant="ghost"
            className="w-full h-16 rounded-2xl bg-gray-900 flex items-center justify-between px-6 text-white font-bold hover:bg-black transition-all shadow-xl"
          >
            <div className="flex items-center gap-3">
              <div className="bg-white/10 p-2 rounded-lg">
                <MessageSquare className="w-4 h-4 text-yellow-400 fill-current" />
              </div>
              <div className="text-left">
                <span className="block text-[11px] font-black uppercase tracking-widest leading-none">Find Merchant</span>
                <span className="text-[8px] opacity-60 font-bold">Manual Transfer & Escrow</span>
              </div>
            </div>
            <ExternalLink className="w-4 h-4 text-yellow-400" />
          </Button>

          {isPesaPalCountry ? (
            <div className="flex items-center justify-center gap-2 text-gray-300 py-4">
              <ShieldCheck className="w-4 h-4" />
              <span className="text-[9px] font-black tracking-[0.2em]">Secured by PesaPal</span>
            </div>
          ) : (
             <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100 text-center">
               <p className="text-[9px] font-bold text-blue-700 leading-relaxed uppercase tracking-widest">
                 Automated card payments are unavailable in {currentCountry}. Please select a package to contact a verified merchant.
               </p>
             </div>
          )}
        </div>
      </main>

      <footer className="fixed bottom-0 inset-x-0 p-6 bg-white/90 backdrop-blur-md border-t border-gray-50 z-40 flex flex-col gap-4">
        <Button 
          onClick={handleRecharge}
          disabled={isProcessing || !selectedId}
          className="w-full h-16 rounded-full bg-[#00A2FF] hover:bg-[#0081CC] text-white font-black tracking-widest text-sm shadow-xl active:scale-95 transition-all"
        >
          {isProcessing ? <Loader2 className="w-6 h-6 animate-spin" /> : (
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 fill-current text-yellow-300" />
              {!isPesaPalCountry 
                ? (selectedPackage ? `Contact Merchant (${formatPrice(selectedPackage.priceKes)})` : "Select a Package")
                : (selectedPackage ? `Recharge Now (${formatPrice(selectedPackage.priceKes)})` : "Select a Package")
              }
            </div>
          )}
        </Button>
      </footer>
    </div>
  )
}
