
"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/firebase/auth/use-user"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ChevronLeft, Gem, History, Coins, ArrowRightLeft, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { convertDiamondsToCoinsAction } from "@/app/actions/matchflow-actions"

export default function IncomePage() {
  const router = useRouter()
  const { user } = useUser()
  const { toast } = useToast()
  
  const [balances, setBalances] = useState({ coins: 0, diamonds: 0 })
  const [balanceLoading, setBalanceLoading] = useState(true)
  const [diamondsToConvert, setDiamondsToConvert] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)

  useEffect(() => {
    if (!user?.id) return
    const fetchBalances = async () => {
      const { data } = await supabase.from('balances').select('*').eq('user_id', user.id).maybeSingle()
      if (data) setBalances({ coins: data.coins || 0, diamonds: Number(data.diamonds) || 0 })
      setBalanceLoading(false)
    }
    fetchBalances()

    const channel = supabase.channel(`income-sync:${user.id}`).on('postgres_changes', { event: 'UPDATE', table: 'balances', filter: `user_id=eq.${user.id}` }, (payload) => {
      setBalances({ coins: payload.new.coins || 0, diamonds: Number(payload.new.diamonds) || 0 })
    }).subscribe()
      
    return () => { supabase.removeChannel(channel) }
  }, [user?.id])

  const diamondBalance = balances.diamonds
  const conversionRate = 0.09 
  const minDiamonds = 1000
  const expectedCoins = Math.floor(Number(diamondsToConvert) * conversionRate)

  const handleConvert = async () => {
    const amount = Number(diamondsToConvert)
    if (isNaN(amount) || amount < minDiamonds || amount > diamondBalance) {
      toast({ variant: "destructive", title: "Invalid Amount" })
      return
    }

    setIsProcessing(true)
    try {
      const res = await convertDiamondsToCoinsAction(user!.id, amount, expectedCoins)
      
      if (res.success) {
        toast({ title: "Conversion Successful!", description: `Added ${expectedCoins} coins to wallet.` })
        setDiamondsToConvert("")
      } else {
        toast({ variant: "destructive", title: "Error", description: res.error })
      }
    } catch (err) {
      toast({ variant: "destructive", title: "System Error" })
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="flex-1 bg-white min-h-screen flex flex-col select-none">
      <header className="px-4 h-16 flex items-center justify-between border-b bg-white sticky top-0 z-50">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full"><ChevronLeft className="w-6 h-6 text-black" /></Button>
        <h1 className="text-sm font-bold text-black uppercase tracking-widest">My Income</h1>
        <Button variant="ghost" size="icon" onClick={() => router.push("/diamond-history")} className="rounded-full"><History className="w-5 h-5 text-black" /></Button>
      </header>

      <main className="flex-1 p-6 space-y-8">
        <div className="bg-gradient-to-br from-[#00A2FF] to-[#0081CC] p-8 rounded-[2.5rem] shadow-xl text-white relative overflow-hidden">
          <div className="relative z-10">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-80 mb-2">Total Diamonds</p>
            <div className="flex items-center gap-3"><Gem className="w-8 h-8 fill-blue-200" /><h2 className="text-4xl font-bold tracking-tight">{diamondBalance.toFixed(0)}</h2></div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase text-gray-400 ml-1">Convert to Coins (Min {minDiamonds})</Label>
            <div className="relative">
              <Input type="number" placeholder={minDiamonds.toString()} value={diamondsToConvert} onChange={(e) => setDiamondsToConvert(e.target.value)} className="rounded-2xl h-16 pl-12 border-gray-100 bg-gray-50 text-lg font-bold" />
              <Gem className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-400" />
            </div>
          </div>

          {Number(diamondsToConvert) >= minDiamonds && (
            <div className="p-5 rounded-2xl border bg-blue-50 border-blue-100 flex items-center justify-between animate-in zoom-in-95">
              <div className="flex items-center gap-3"><Coins className="w-5 h-5 text-yellow-500" /><span className="text-[10px] font-bold text-black uppercase tracking-widest">Receiving</span></div>
              <span className="text-xl font-bold text-blue-600">+{expectedCoins} Coins</span>
            </div>
          )}

          <Button className="w-full h-16 rounded-full bg-[#00A2FF] text-white font-bold uppercase tracking-widest text-sm shadow-xl active:scale-95 transition-all" onClick={handleConvert} disabled={isProcessing || !diamondsToConvert || Number(diamondsToConvert) < minDiamonds}>
            {isProcessing ? <Loader2 className="animate-spin" /> : <div className="flex items-center gap-2"><ArrowRightLeft className="w-5 h-5" />Confirm Conversion</div>}
          </Button>
        </div>
      </main>
    </div>
  )
}
