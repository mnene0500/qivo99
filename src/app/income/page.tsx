"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/firebase/auth/use-user"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ChevronLeft, Gem, History, Coins, ArrowRightLeft, Loader2, Sparkles } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { convertDiamondsToCoinsAction } from "@/app/actions/matchflow-actions"
import { useBalance } from "@/lib/providers/BalanceProvider"

export default function IncomePage() {
  const router = useRouter()
  const { user } = useUser()
  const { toast } = useToast()
  const { diamonds: globalDiamonds } = useBalance()
  
  const [diamondsToConvert, setDiamondsToConvert] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)

  const diamondBalance = Number(globalDiamonds) || 0
  const conversionRate = 0.09 
  const minDiamonds = 1000
  const expectedCoins = Math.floor(Number(diamondsToConvert) * conversionRate)

  const handleConvert = async () => {
    const amount = Number(diamondsToConvert)
    if (isNaN(amount) || amount < minDiamonds || amount > diamondBalance) {
      toast({ variant: "destructive", title: "Invalid Amount" }); return;
    }
    setIsProcessing(true)
    try {
      const res = await convertDiamondsToCoinsAction(user!.id, amount, expectedCoins)
      if (res.success) {
        toast({ title: "Exchange Successful!" }); setDiamondsToConvert("")
      }
    } finally { setIsProcessing(false) }
  }

  return (
    <div className="flex-1 bg-white min-h-screen flex flex-col select-none">
      <header className="px-4 h-16 flex items-center justify-between border-b bg-white sticky top-0 z-50">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full"><ChevronLeft className="w-6 h-6 text-black" /></Button>
        <h1 className="text-sm font-black text-black uppercase tracking-widest">Revenue Exchange</h1>
        <Button variant="ghost" size="icon" onClick={() => router.push("/diamond-history")} className="rounded-full"><History className="w-5 h-5 text-black" /></Button>
      </header>

      <main className="flex-1 p-8 space-y-12">
        <div className="bg-black p-10 rounded-[3rem] shadow-2xl text-white relative overflow-hidden">
          <Sparkles className="absolute -right-4 -top-4 w-24 h-24 text-white/10" />
          <div className="relative z-10 space-y-4">
            <p className="text-[11px] font-black uppercase tracking-[0.3em] opacity-40">Diamond Earnings</p>
            <div className="flex items-center gap-4"><Gem className="w-10 h-10 text-[#00A2FF] fill-current" /><h2 className="text-5xl font-black tracking-tighter">{diamondBalance.toFixed(0)}</h2></div>
          </div>
        </div>

        <div className="space-y-8">
          <div className="space-y-3">
            <Label className="text-[10px] font-black uppercase text-gray-400 ml-2 tracking-widest">Amount to Convert (Min 1000)</Label>
            <div className="relative">
              <Input type="number" placeholder="1000" value={diamondsToConvert} onChange={(e) => setDiamondsToConvert(e.target.value)} className="rounded-[2rem] h-20 pl-16 border-gray-100 bg-gray-50 text-2xl font-black tracking-tight focus:bg-white transition-all" />
              <Gem className="absolute left-6 top-1/2 -translate-y-1/2 w-6 h-6 text-[#00A2FF]" />
            </div>
          </div>

          {Number(diamondsToConvert) >= minDiamonds && (
            <div className="p-8 rounded-[2.5rem] border bg-blue-50 border-blue-100 flex items-center justify-between animate-in zoom-in-95">
              <div className="flex items-center gap-4"><div className="bg-white p-2 rounded-xl shadow-sm"><Coins className="w-6 h-6 text-yellow-500 fill-current" /></div><span className="text-[11px] font-black text-black uppercase tracking-widest">You'll Receive</span></div>
              <span className="text-3xl font-black text-[#00A2FF]">+{expectedCoins} <span className="text-[10px] uppercase">Coins</span></span>
            </div>
          )}

          <Button className="w-full h-20 rounded-full bg-[#00A2FF] text-white font-black uppercase tracking-[0.2em] text-sm shadow-xl active:scale-95 transition-all" onClick={handleConvert} disabled={isProcessing || !diamondsToConvert || Number(diamondsToConvert) < minDiamonds || Number(diamondsToConvert) > diamondBalance}>
            {isProcessing ? <Loader2 className="animate-spin" /> : <div className="flex items-center gap-3"><ArrowRightLeft className="w-6 h-6" /> Confirm Exchange</div>}
          </Button>
        </div>
      </main>
    </div>
  )
}
