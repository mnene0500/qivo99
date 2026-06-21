"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/firebase/auth/use-user"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ChevronLeft, Banknote, Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"

interface WithdrawalRequest {
  id: string
  diamonds: number
  amount_kes: number
  status: 'pending' | 'paid' | 'rejected'
  timestamp: number
  agency_id: string
}

export default function AgencyHistoryPage() {
  const router = useRouter()
  const { user } = useUser()
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.id) return
    
    const fetchWithdrawals = async () => {
      // Strictly only showing last 2 transactions as requested
      const { data } = await supabase
        .from('withdrawals')
        .select('*')
        .eq('user_id', user.id)
        .order('timestamp', { ascending: false })
        .limit(2)
      
      if (data) setWithdrawals(data as any)
      setLoading(false)
    }

    fetchWithdrawals()

    // Real-time status updates strictly filtered for current user
    const channel = supabase.channel(`member-payouts:${user.id}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public',
        table: 'withdrawals', 
        filter: `user_id=eq.${user.id}` 
      }, () => fetchWithdrawals())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user?.id])

  return (
    <div className="flex-1 bg-white min-h-screen flex flex-col select-none animate-in fade-in duration-500">
      <header className="px-4 h-16 flex items-center justify-between border-b sticky top-0 bg-white z-50">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full">
          <ChevronLeft className="w-6 h-6 text-black" />
        </Button>
        <h1 className="text-sm font-black text-black uppercase tracking-widest">Payout History</h1>
        <div className="w-10" />
      </header>

      <main className="flex-1 overflow-y-auto no-scrollbar pb-20">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[#00A2FF]" />
          </div>
        ) : withdrawals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 px-12 text-center space-y-4 opacity-40">
            <div className="w-16 h-16 bg-gray-100 rounded-[2rem] flex items-center justify-center">
              <Banknote className="w-8 h-8 text-gray-400" />
            </div>
            <div className="space-y-1">
              <p className="font-black text-[10px] uppercase tracking-[0.2em]">No Activity</p>
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-relaxed">Your withdrawal requests<br/>will appear here</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            <div className="px-6 py-4 bg-amber-50/50 border-b border-amber-100/50">
               <p className="text-[8px] font-black text-amber-600 uppercase tracking-widest text-center">Only showing the 2 most recent transactions</p>
            </div>
            {withdrawals.map((req) => (
              <div key={req.id} className="p-6 hover:bg-gray-50/50 transition-colors animate-in slide-in-from-bottom-2">
                <div className="flex justify-between items-start mb-3">
                  <div className="space-y-1">
                    <p className="text-xl font-black text-black tracking-tight">Ksh {req.amount_kes}</p>
                    <p className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">
                      {format(new Date(Number(req.timestamp)), "MMM d, HH:mm")}
                    </p>
                  </div>
                  <StatusBadge status={req.status} />
                </div>
                <div className="flex items-center justify-between gap-2 px-4 py-3 bg-gray-50 rounded-2xl border border-black/[0.03]">
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Diamonds Exchanged</p>
                  <p className="text-xs font-black text-black">{req.diamonds}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function StatusBadge({ status }: { status: WithdrawalRequest['status'] }) {
  const configs = {
    pending: { icon: Clock, text: 'Pending', className: 'text-amber-500 bg-amber-50 border-amber-100' },
    paid: { icon: CheckCircle2, text: 'Paid', className: 'text-green-600 bg-green-50 border-green-100' },
    rejected: { icon: XCircle, text: 'Rejected', className: 'text-red-500 bg-red-50 border-red-100' }
  }

  const config = configs[status] || configs.pending;
  const Icon = config.icon

  return (
    <div className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[9px] font-black uppercase tracking-widest", config.className)}>
      <Icon className="w-3 h-3" />
      {config.text}
    </div>
  )
}
