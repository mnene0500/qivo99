"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/firebase/auth/use-user"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ChevronLeft, Coins, Loader2, Send, Zap, Target } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { sendMysteryNoteAction } from "@/app/actions/matchflow-actions"
import { cn } from "@/lib/utils"

const RECIPIENT_OPTIONS = [2, 3, 5, 10]
const COST_PER_PERSON = 10

export default function MysteryNotePage() {
  const router = useRouter()
  const { user } = useUser()
  const { toast } = useToast()

  const [message, setMessage] = useState("")
  const [recipientCount, setRecipientCount] = useState(5)
  const [isSending, setIsSending] = useState(false)
  const [userCoins, setUserCoins] = useState<number | null>(null)

  useEffect(() => {
    if (!user?.id) return
    
    const fetchBalance = async () => {
      const { data: b } = await supabase.from('balances').select('coins').eq('user_id', user.id).maybeSingle()
      if (b) setUserCoins(Number(b.coins) || 0)
    }

    fetchBalance()

    const channel = supabase.channel(`mystery-note-sync:${user.id}`)
      .on('postgres_changes', { event: 'UPDATE', table: 'balances', filter: `user_id=eq.${user.id}` }, (payload) => {
        setUserCoins(Number(payload.new.coins) || 0)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user?.id])

  const totalCost = Number(recipientCount) * COST_PER_PERSON

  const handleSend = async () => {
    if (!user?.id || !message.trim()) return
    
    // Anti-scam: Block numbers
    if (/\d{3,}/.test(message)) {
      toast({ variant: "destructive", title: "Security Block", description: "Sharing phone numbers or IDs is not allowed in blasts." });
      return;
    }

    const currentCoins = Number(userCoins ?? 0);
    const requiredCoins = Number(totalCost);

    if (userCoins === null) {
      toast({ title: "Checking wallet..." })
      return
    }

    if (currentCoins < requiredCoins) {
      toast({ 
        variant: "destructive", 
        title: "Insufficient Coins", 
        description: `You need ${requiredCoins} coins for this broadcast.` 
      })
      return
    }

    setIsSending(true)
    try {
      const res = await sendMysteryNoteAction(user.id, message, recipientCount)
      if (res.success) {
        toast({ title: "Blast Dispatched!", description: "Conversations have been started with chosen recipients." })
        router.push("/chats")
      } else {
        toast({ variant: "destructive", title: "Blast Failed", description: res.error })
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Signal Lost", description: "Please check your connection." })
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="flex-1 bg-gradient-to-br from-indigo-700 via-purple-700 to-pink-600 min-h-screen flex flex-col select-none relative overflow-hidden animate-in fade-in duration-700">
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none z-0">
        <div className="absolute -top-20 -right-20 w-96 h-96 bg-white/10 rounded-full blur-[100px] animate-pulse" />
        <div className="absolute bottom-20 -left-20 w-80 h-80 bg-blue-400/10 rounded-full blur-[80px]" />
      </div>
      
      <header className="px-4 h-16 flex items-center justify-between bg-transparent z-50">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full text-white hover:bg-white/10">
          <ChevronLeft className="w-8 h-8" />
        </Button>
        <div className="px-4 py-1.5 bg-black/20 backdrop-blur-xl rounded-full border border-white/10 flex items-center gap-2">
           <Coins className="w-3.5 h-3.5 text-yellow-400 fill-current" />
           <span className="text-xs font-black text-white tracking-tighter">{userCoins ?? '...'}</span>
        </div>
      </header>

      <main className="flex-1 px-6 pt-4 pb-12 space-y-10 overflow-y-auto no-scrollbar relative z-[60]">
        <div className="space-y-2 px-2 text-center">
          <div className="w-20 h-20 bg-white/10 backdrop-blur-3xl rounded-[2rem] border border-white/20 flex items-center justify-center mx-auto mb-6 shadow-2xl group active:scale-90 transition-transform">
             <Zap className="w-10 h-10 text-white fill-current group-hover:animate-pulse" />
          </div>
          <h1 className="text-4xl font-black text-white tracking-tighter leading-none uppercase italic">Message <span className="text-yellow-400">Blast</span></h1>
          <p className="text-[10px] font-black text-white/40 tracking-[0.4em] uppercase">Targeted Global Transmission</p>
        </div>

        <div className="bg-white/10 backdrop-blur-3xl border border-white/20 rounded-[3.5rem] p-8 shadow-2xl space-y-10 relative overflow-hidden">
          <div className="space-y-6">
            <div className="flex justify-between items-end">
               <div className="space-y-1">
                 <h2 className="text-2xl font-black text-white leading-none">The Broadcast</h2>
                 <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Sent only to opposite gender</p>
               </div>
               <div className="px-3 py-1 bg-yellow-400 rounded-lg shadow-lg rotate-3">
                 <span className="text-[10px] font-black text-black tracking-tight">{COST_PER_PERSON} <Coins className="inline w-3 h-3 mb-0.5" /> / User</span>
               </div>
            </div>

            <div className="relative group z-20">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-500 rounded-[2rem] blur-xl opacity-0 group-focus-within:opacity-20 transition-opacity" />
              <Textarea 
                placeholder="Broadcast your mood, a question, or a greeting..." 
                value={message} 
                onChange={(e) => setMessage(e.target.value)} 
                className="bg-white rounded-[2.5rem] min-h-[180px] border-none text-slate-900 font-bold p-8 text-base shadow-inner focus-visible:ring-4 focus-visible:ring-white/20 transition-all placeholder:text-slate-300 relative z-30" 
              />
            </div>
          </div>

          <div className="space-y-8 relative z-20">
            <div className="space-y-4">
              <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em] text-center">Opposite Gender Reach</p>
              <div className="flex flex-wrap justify-center gap-3">
                {RECIPIENT_OPTIONS.map(n => (
                  <button
                    key={n}
                    onClick={() => setRecipientCount(n)}
                    className={cn(
                      "px-6 py-3 rounded-2xl font-black text-xs transition-all border active:scale-90",
                      recipientCount === n 
                        ? "bg-white text-indigo-600 border-white shadow-xl shadow-white/10" 
                        : "bg-white/5 text-white/40 border-white/10 hover:bg-white/10"
                    )}
                  >
                    {n} PEERS
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4 pt-4">
              <div className="flex justify-between items-center px-6">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-white/40" />
                  <span className="text-[10px] font-black text-white/40 tracking-widest uppercase">Required Power</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-3xl font-black text-white tracking-tighter">{totalCost}</span>
                  <Coins className="w-6 h-6 text-yellow-400 fill-current" />
                </div>
              </div>
              
              <Button 
                onClick={handleSend} 
                disabled={isSending || !message.trim() || userCoins === null} 
                className="w-full h-20 rounded-[2.5rem] bg-white text-indigo-700 font-black tracking-[0.2em] text-sm shadow-[0_20px_50px_rgba(0,0,0,0.3)] active:scale-95 transition-all py-8 group"
              >
                {isSending ? (
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-6 h-6 animate-spin" />
                    DISPATCHING...
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <Send className="w-6 h-6 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                    INITIATE BLAST
                  </div>
                )}
              </Button>
            </div>
          </div>
        </div>
      </main>
      
      <footer className="p-8 text-center">
        <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.5em]">QIVO Targeted Broadcast Engine v2.5</p>
      </footer>
    </div>
  )
}
