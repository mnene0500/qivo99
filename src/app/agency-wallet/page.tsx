"use client"

import { useEffect, useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/firebase/auth/use-user"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ChevronLeft, Gem, Banknote, History, Wallet, ArrowRightLeft, Loader2, Info, Smartphone, Calendar, ShieldCheck } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { requestWithdrawalAction } from "@/app/actions/matchflow-actions"

export default function AgencyMemberPage() {
  const router = useRouter()
  const { user } = useUser()
  const { toast } = useToast()
  
  const [diamondsToUse, setDiamondsToUse] = useState<string>("")
  const [mpesaNumber, setMpesaNumber] = useState<string>("")
  const [isProcessing, setIsProcessing] = useState(false)
  const [balances, setBalances] = useState({ coins: 0, diamonds: 0 })
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.id) return
    const fetchData = async () => {
      const { data: p } = await supabase.from('users').select('*').eq('uid', user.id).single()
      const { data: b } = await supabase.from('balances').select('*').eq('user_id', user.id).single()
      if (p) setProfile(p)
      if (b) setBalances({ coins: b.coins || 0, diamonds: Number(b.diamonds) || 0 })
      setLoading(false)
    }
    fetchData()
  }, [user?.id])

  const isSaturday = useMemo(() => new Date().getDay() === 6, []);
  const diamondBalance = balances.diamonds
  const cashRate = 0.08 
  const minDiamondsForCash = 12500
  const expectedKes = (Number(diamondsToUse) * cashRate).toFixed(0)

  const handleWithdraw = async () => {
    if (!isSaturday) { toast({ variant: "destructive", title: "Only on Saturdays" }); return; }
    const amount = Number(diamondsToUse)
    if (isNaN(amount) || amount < minDiamondsForCash || amount > diamondBalance) { toast({ variant: "destructive", title: "Invalid Amount" }); return; }
    if (!mpesaNumber || mpesaNumber.length < 10) { toast({ variant: "destructive", title: "Valid M-Pesa required" }); return; }
    setIsProcessing(true)
    try {
      const res = await requestWithdrawalAction(user!.id, amount, Number(expectedKes), profile.agency_id, mpesaNumber)
      if (res.success) {
        setBalances({ ...balances, diamonds: balances.diamonds - amount }); toast({ title: "Payout Requested" }); setDiamondsToUse(""); setMpesaNumber("")
      }
    } finally { setIsProcessing(false) }
  }

  if (loading) return <div className="flex-1 flex items-center justify-center min-h-screen bg-white"><Loader2 className="animate-spin text-[#00A2FF] w-8 h-8" /></div>

  return (
    <div className="flex-1 bg-white min-h-screen flex flex-col select-none">
      <header className="px-4 h-16 flex items-center justify-between border-b bg-white sticky top-0 z-50">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full"><ChevronLeft className="w-6 h-6 text-black" /></Button>
        <h1 className="text-sm font-black text-black uppercase tracking-widest">Agency Wallet</h1>
        <Button variant="ghost" size="icon" onClick={() => router.push("/agency-history")} className="rounded-full"><History className="w-5 h-5 text-black" /></Button>
      </header>

      <main className="flex-1 p-8 space-y-12 pb-32">
        <div className="bg-gradient-to-br from-purple-700 to-indigo-800 p-10 rounded-[3.5rem] shadow-2xl text-white relative overflow-hidden">
          <ShieldCheck className="absolute -right-4 -top-4 w-24 h-24 text-white/10" />
          <div className="relative z-10 space-y-6">
            <p className="text-[11px] font-black uppercase tracking-[0.4em] opacity-50">Settlement Balance</p>
            <div className="flex items-center gap-4"><Gem className="w-10 h-10 text-purple-200 fill-current" /><h2 className="text-5xl font-black tracking-tighter">{diamondBalance.toFixed(0)}</h2></div>
            <div className="flex justify-between items-center bg-white/10 p-4 rounded-2xl border border-white/5"><div className="space-y-0.5"><p className="text-[8px] font-black uppercase opacity-50">Agency ID</p><p className="text-xs font-black">{profile?.agency_id || "---"}</p></div><div className="text-right space-y-0.5"><p className="text-[8px] font-black uppercase opacity-50">Member Status</p><p className="text-xs font-black uppercase text-green-400">{profile?.agency_status || "Pending"}</p></div></div>
          </div>
        </div>

        <div className="space-y-8">
          {!isSaturday && <div className="p-6 bg-red-50 rounded-[2rem] border border-red-100 flex items-start gap-4"><Calendar className="w-6 h-6 text-red-600 mt-1" /><div className="space-y-1"><p className="text-xs font-black text-red-900 uppercase">Payouts Closed</p><p className="text-[11px] font-bold text-red-700/70 leading-relaxed">System withdrawals are strictly limited to Saturdays. Please return on the weekend.</p></div></div>}

          <div className="space-y-6">
            <div className="space-y-3"><Label className="text-[10px] font-black uppercase text-gray-400 ml-2 tracking-widest">Diamonds to Cash (Min 12.5k)</Label><div className="relative"><Input disabled={!isSaturday} type="number" placeholder="0" value={diamondsToUse} onChange={(e) => setDiamondsToUse(e.target.value)} className="rounded-3xl h-20 pl-16 border-gray-100 bg-gray-50 text-2xl font-black" /><Gem className="absolute left-6 top-1/2 -translate-y-1/2 w-6 h-6 text-purple-500" /></div></div>
            <div className="space-y-3"><Label className="text-[10px] font-black uppercase text-gray-400 ml-2 tracking-widest">Destination M-Pesa</Label><div className="relative"><Input disabled={!isSaturday} type="tel" placeholder="07XX XXX XXX" value={mpesaNumber} onChange={(e) => setMpesaNumber(e.target.value)} className="rounded-3xl h-20 pl-16 border-gray-100 bg-gray-50 text-2xl font-black tracking-widest" /><Smartphone className="absolute left-6 top-1/2 -translate-y-1/2 w-6 h-6 text-blue-500" /></div></div>
          </div>

          {Number(diamondsToUse) > 0 && isSaturday && (
            <div className="p-8 rounded-[2.5rem] border bg-green-50 border-green-100 flex items-center justify-between animate-in zoom-in-95">
              <div className="flex items-center gap-4"><Banknote className="w-6 h-6 text-green-600" /><span className="text-[11px] font-black text-black uppercase tracking-widest">Paisa Reward</span></div>
              <span className="text-3xl font-black text-green-600">KES {expectedKes}</span>
            </div>
          )}

          <Button className="w-full h-20 rounded-full bg-black text-white font-black uppercase tracking-[0.2em] text-sm shadow-xl active:scale-95 transition-all" onClick={handleWithdraw} disabled={isProcessing || !diamondsToUse || Number(diamondsToUse) < minDiamondsForCash || !mpesaNumber || !isSaturday}>{isProcessing ? <Loader2 className="animate-spin" /> : <div className="flex items-center gap-3"><Banknote className="w-6 h-6" /> Initiate Payout</div>}</Button>
        </div>
      </main>
    </div>
  )
}
