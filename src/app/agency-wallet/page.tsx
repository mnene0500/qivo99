
"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/firebase/auth/use-user"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { 
  ChevronLeft, 
  Gem, 
  Banknote, 
  History, 
  Wallet, 
  ArrowRightLeft, 
  Loader2, 
  Info,
  ShieldCheck
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { requestWithdrawalAction } from "@/app/actions/matchflow-actions"

export default function AgencyMemberPage() {
  const router = useRouter()
  const { user } = useUser()
  const { toast } = useToast()
  
  const [diamondsToUse, setDiamondsToUse] = useState<string>("")
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

  const diamondBalance = balances.diamonds
  const cashRate = 0.08 
  const minDiamondsForCash = 12500
  const expectedKes = (Number(diamondsToUse) * cashRate).toFixed(2)

  const handleWithdraw = async () => {
    const amount = Number(diamondsToUse)
    if (isNaN(amount) || amount < minDiamondsForCash || amount > diamondBalance) {
      toast({ variant: "destructive", title: "Invalid Amount" })
      return
    }
    if (!profile?.agency_id || profile.agency_status !== 'approved') {
      toast({ variant: "destructive", title: "Agency Required" })
      return
    }

    setIsProcessing(true)
    try {
      const ts = Date.now()
      const res = await requestWithdrawalAction(user!.id, amount, Number(expectedKes), profile.agency_id)
      
      if (res.success) {
        setBalances({ ...balances, diamonds: balances.diamonds - amount })
        toast({ title: "Request Sent", description: "Your agency leader will process this payout." })
        setDiamondsToUse("")
      } else {
        toast({ variant: "destructive", title: "Error", description: res.error })
      }
    } catch (e) {
      toast({ variant: "destructive", title: "System Error" })
    } finally {
      setIsProcessing(false)
    }
  }

  if (loading) return <div className="flex-1 flex items-center justify-center min-h-screen bg-white"><Loader2 className="animate-spin text-[#00A2FF]" /></div>

  return (
    <div className="flex-1 bg-white min-h-screen flex flex-col select-none">
      <header className="px-4 h-16 flex items-center justify-between border-b bg-white sticky top-0 z-50">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full"><ChevronLeft className="w-6 h-6 text-black" /></Button>
        <h1 className="text-sm font-bold text-black uppercase tracking-widest">Agency Wallet</h1>
        <Button variant="ghost" size="icon" onClick={() => router.push("/agency-history")} className="rounded-full"><History className="w-5 h-5 text-black" /></Button>
      </header>

      <main className="flex-1 p-6 space-y-8">
        <div className="bg-gradient-to-br from-purple-600 to-purple-400 p-8 rounded-[2.5rem] shadow-xl text-white relative overflow-hidden">
          <div className="relative z-10">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-80 mb-2">Withdrawable Diamonds</p>
            <div className="flex items-center gap-3 mb-6">
              <Gem className="w-8 h-8 fill-purple-200" />
              <h2 className="text-4xl font-bold tracking-tight">{diamondBalance.toFixed(0)}</h2>
            </div>
            <div className="flex justify-between items-center bg-white/10 p-4 rounded-2xl">
              <div><p className="text-[9px] font-bold uppercase tracking-widest opacity-60">Agency ID</p><p className="text-xs font-bold">{profile?.agency_id || "---"}</p></div>
              <div className="text-right"><p className="text-[9px] font-bold uppercase tracking-widest opacity-60">Status</p><p className="text-xs font-bold uppercase text-purple-100">{profile?.agency_status || "None"}</p></div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase text-gray-400 ml-1">Diamonds to Cash</Label>
            <div className="relative">
              <Input type="number" placeholder={`Min ${minDiamondsForCash}`} value={diamondsToUse} onChange={(e) => setDiamondsToUse(e.target.value)} className="rounded-2xl h-16 pl-12 border-gray-100 bg-gray-50 text-lg font-bold" />
              <Gem className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-green-500" />
            </div>
          </div>

          {Number(diamondsToUse) > 0 && (
            <div className="p-5 rounded-2xl border flex items-center justify-between bg-green-50 border-green-100">
              <div className="flex items-center gap-3"><Banknote className="w-5 h-5 text-green-600" /><span className="text-[10px] font-bold text-black uppercase tracking-widest">You'll Receive</span></div>
              <span className="text-xl font-bold text-green-600">Ksh {expectedKes}</span>
            </div>
          )}

          <div className="p-5 bg-amber-50 rounded-2xl border border-amber-100 flex items-start gap-4">
            <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-[10px] font-black text-amber-900 uppercase tracking-widest">Financial Notice</p>
              <p className="text-[10px] font-bold text-amber-700 leading-relaxed uppercase tracking-widest">
                Please note: Standard transaction and processing charges apply during withdrawal based on your local bank or mobile money provider (M-Pesa).
              </p>
            </div>
          </div>

          <Button className="w-full h-16 rounded-full bg-green-600 text-white font-bold uppercase tracking-widest text-sm shadow-xl active:scale-95 transition-all" onClick={handleWithdraw} disabled={isProcessing || !diamondsToUse || Number(diamondsToUse) < minDiamondsForCash}>
            {isProcessing ? <Loader2 className="animate-spin" /> : <div className="flex items-center gap-2"><ArrowRightLeft className="w-5 h-5" />Request Payout</div>}
          </Button>
        </div>
      </main>
    </div>
  )
}
