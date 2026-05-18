"use client"

import { useEffect, useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { doc } from "firebase/firestore"
import { ref, push, set, get } from "firebase/database"
import { useFirestore, useUser, useDoc, useDatabase } from "@/firebase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ChevronLeft, Gem, Banknote, History, Wallet, ArrowRightLeft } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { requestWithdrawalAction } from "@/app/actions/matchflow-actions"
import { cn } from "@/lib/utils"

interface UserProfile {
  uid: string
  name: string
  agencyId?: string
  agencyStatus?: string
}

export default function AgencyMemberPage() {
  const router = useRouter()
  const { user } = useUser()
  const db = useFirestore()
  const rtdb = useDatabase()
  const { toast } = useToast()
  
  const [diamondsToUse, setDiamondsToUse] = useState<string>("")
  const [isProcessing, setIsProcessing] = useState(false)
  
  const [balances, setBalances] = useState({ coins: 0, diamonds: 0 })
  const [balanceLoading, setBalanceLoading] = useState(true)

  const userRef = useMemo(() => user?.uid ? doc(db, "users", user.uid) : null, [db, user?.uid])
  const { data: profile } = useDoc<UserProfile>(userRef)

  // Avoid hydration mismatch by loading cache in useEffect
  useEffect(() => {
    if (typeof window !== 'undefined' && user?.uid) {
      const cached = localStorage.getItem(`balance_cache_${user.uid}`)
      if (cached) setBalances(JSON.parse(cached))
    }
  }, [user?.uid])

  useEffect(() => {
    if (!user?.uid) return
    const fetchBalances = async () => {
      try {
        const snap = await get(ref(rtdb, `balances/${user.uid}`))
        if (snap.exists()) {
          const data = snap.val()
          const newBal = { coins: data.coins || 0, diamonds: data.diamonds || 0 }
          setBalances(newBal)
          localStorage.setItem(`balance_cache_${user.uid}`, JSON.stringify(newBal))
        }
      } finally {
        setBalanceLoading(false)
      }
    }
    fetchBalances()
  }, [rtdb, user?.uid])

  const diamondBalance = balances.diamonds
  
  const cashRate = 0.08 
  const minDiamondsForCash = 12500

  const expectedKes = (Number(diamondsToUse) * cashRate).toFixed(2)

  const handleWithdraw = async () => {
    const amount = Number(diamondsToUse)
    if (isNaN(amount) || amount < minDiamondsForCash) {
      toast({ variant: "destructive", title: "Invalid Amount", description: `Min withdrawal: ${minDiamondsForCash} diamonds.` })
      return
    }
    if (!profile?.agencyId || profile.agencyStatus !== 'approved') {
      toast({ variant: "destructive", title: "Agency Required", description: "You must be an approved agency member." })
      return
    }
    if (amount > diamondBalance) {
      toast({ variant: "destructive", title: "Insufficient Balance" })
      return
    }

    setIsProcessing(true)
    const res = await requestWithdrawalAction(profile.uid, amount, Number(expectedKes), profile.agencyId)
    if (res.success) {
      const timestamp = Date.now()
      await set(push(ref(rtdb, `diamond_history/${user?.uid}`)), {
        amount: -amount,
        type: 'withdrawal',
        description: `Withdrawal request for Ksh ${expectedKes}`,
        timestamp
      })

      const newBal = { ...balances, diamonds: balances.diamonds - amount }
      setBalances(newBal)
      if (user?.uid) localStorage.setItem(`balance_cache_${user.uid}`, JSON.stringify(newBal))

      toast({ title: "Request Sent", description: "Your agent will review your payment." })
      setDiamondsToUse("")
    } else {
      toast({ variant: "destructive", title: "Error", description: res.error })
    }
    setIsProcessing(false)
  }

  return (
    <div className="flex-1 bg-white min-h-screen flex flex-col select-none">
      <header className="px-4 h-16 flex items-center justify-between border-b bg-white sticky top-0 z-50">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full">
          <ChevronLeft className="w-6 h-6 text-black" />
        </Button>
        <h1 className="text-sm font-bold text-black uppercase tracking-widest">Agency Wallet</h1>
        <Button variant="ghost" size="icon" onClick={() => router.push("/agency-history")} className="rounded-full">
          <History className="w-5 h-5 text-black" />
        </Button>
      </header>

      <main className="flex-1 p-6 space-y-8">
        <div className="bg-gradient-to-br from-purple-600 to-purple-400 p-8 rounded-[2.5rem] shadow-xl text-white relative overflow-hidden">
          <Wallet className="absolute -right-4 -bottom-4 w-32 h-32 opacity-10" />
          <div className="relative z-10">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-80 mb-2">Available Diamonds</p>
            <div className="flex items-center gap-3 mb-6">
              <Gem className="w-8 h-8 fill-purple-200" />
              <h2 className="text-4xl font-bold tracking-tight">
                {balanceLoading && balances.diamonds === 0 ? "..." : diamondBalance.toFixed(0)}
              </h2>
            </div>
            <div className="flex justify-between items-center bg-white/10 p-4 rounded-2xl">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest opacity-60">Agency ID</p>
                <p className="text-xs font-bold">{profile?.agencyId || "---"}</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-bold uppercase tracking-widest opacity-60">Status</p>
                <p className="text-xs font-bold uppercase tracking-widest text-purple-100">
                  {profile?.agencyStatus || "None"}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-gray-100 p-4 rounded-2xl text-center">
            <p className="text-[10px] font-bold text-green-600 uppercase tracking-widest">Convert Diamonds to Cash</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase text-gray-400 ml-1">Amount of Diamonds</Label>
              <div className="relative">
                <Input
                  type="number"
                  placeholder={`Min ${minDiamondsForCash}`}
                  value={diamondsToUse}
                  onChange={(e) => setDiamondsToUse(e.target.value)}
                  className="rounded-2xl h-16 pl-12 border-gray-100 bg-gray-50 text-lg font-bold"
                />
                <Gem className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-green-500" />
              </div>
            </div>

            {Number(diamondsToUse) > 0 && (
              <div className="p-5 rounded-2xl border flex items-center justify-between animate-in fade-in slide-in-from-top-2 bg-green-50 border-green-100">
                <div className="flex items-center gap-3">
                  <Banknote className="w-5 h-5 text-green-600" />
                  <span className="text-[10px] font-bold text-black uppercase tracking-widest">Estimated Payout</span>
                </div>
                <span className="text-xl font-bold text-green-600">
                  Ksh {expectedKes}
                </span>
              </div>
            )}

            <Button
              className="w-full h-16 rounded-full bg-green-600 text-white font-bold uppercase tracking-widest text-sm shadow-xl active:scale-95 transition-all"
              onClick={handleWithdraw}
              disabled={isProcessing || !diamondsToUse}
            >
              {isProcessing ? "Processing..." : (
                <div className="flex items-center gap-2">
                  <ArrowRightLeft className="w-5 h-5" />
                  Request Cash Payout
                </div>
              )}
            </Button>
          </div>
        </div>
      </main>

      <footer className="p-8 text-center bg-gray-50/50">
        <p className="text-[10px] font-bold text-gray-300 uppercase tracking-[0.2em] leading-relaxed">
          Cash Payout: 1 Diamond = Ksh 0.08. Minimum 12,500 diamonds (Ksh 1,000). Paid via M-Pesa by your agent.
        </p>
      </footer>
    </div>
  )
}
