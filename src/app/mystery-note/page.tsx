"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/firebase/auth/use-user"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ChevronLeft, Coins, Users, Loader2, Send, Sparkles } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { sendMysteryNoteAction } from "@/app/actions/matchflow-actions"

const RECIPIENT_OPTIONS = [2, 5, 10, 20]
const COST_PER_PERSON = 10

export default function MysteryNotePage() {
  const router = useRouter()
  const { user } = useUser()
  const { toast } = useToast()

  const [message, setMessage] = useState("")
  const [recipientCount, setRecipientCount] = useState(2)
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
        description: `You need ${requiredCoins} coins.` 
      })
      return
    }

    setIsSending(true)
    try {
      const res = await sendMysteryNoteAction(user.id, message, recipientCount)
      if (res.success) {
        toast({ title: "Message Blasted!", description: "Sent to anonymous recipients." })
        router.push("/chats")
      } else {
        toast({ variant: "destructive", title: "Error", description: res.error })
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Connection Error" })
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="flex-1 bg-purple-600 min-h-screen flex flex-col select-none relative overflow-hidden animate-in fade-in duration-500">
      <div className="absolute -top-10 -right-20 w-80 h-80 opacity-20 pointer-events-none rotate-12"><Sparkles className="w-full h-full text-white" /></div>
      
      <header className="px-4 h-16 flex items-center bg-transparent z-50">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full text-white hover:bg-white/10"><ChevronLeft className="w-8 h-8" /></Button>
      </header>

      <main className="flex-1 px-6 pt-4 pb-10 space-y-12 overflow-y-auto no-scrollbar relative z-10">
        <div className="space-y-2 px-2">
          <h1 className="text-5xl font-black text-white tracking-tighter leading-tight">Mystery<br/>Note</h1>
          <p className="text-[10px] font-black text-white/60 uppercase tracking-[0.3em] ml-1">Universal Anonymous Blast</p>
        </div>

        <div className="bg-white/15 backdrop-blur-3xl border border-white/20 rounded-[3rem] p-8 shadow-2xl space-y-8">
          <div className="space-y-4">
            <div className="flex justify-between items-start">
               <h2 className="text-2xl font-black text-white leading-tight">Write your<br/>secret...</h2>
               <div className="flex flex-col items-end">
                 <span className="text-[8px] font-black text-white/40 uppercase tracking-widest">My Balance</span>
                 <span className="text-xs font-black text-white flex items-center gap-1.5 bg-black/20 px-3 py-1 rounded-full">
                   <Coins className="w-3 h-3 text-yellow-400" />
                   {userCoins === null ? "..." : userCoins}
                 </span>
               </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
               <div className="flex items-center gap-2 px-4 py-1.5 bg-yellow-400 rounded-full shadow-lg border border-yellow-300"><Coins className="w-3.5 h-3.5 text-yellow-800" /><span className="text-[10px] font-black text-yellow-900 tracking-tighter">{COST_PER_PERSON} / user</span></div>
               <div className="flex items-center gap-2 px-4 py-1.5 bg-white/10 rounded-full border border-white/20">
                  <Users className="w-3.5 h-3.5 text-white/80" />
                  <select 
                    value={recipientCount} 
                    onChange={(e) => setRecipientCount(Number(e.target.value))} 
                    className="bg-transparent border-none text-[10px] font-black text-white outline-none cursor-pointer uppercase appearance-none"
                  >
                    {RECIPIENT_OPTIONS.map(n => <option key={n} value={n} className="text-black">{n} People</option>)}
                  </select>
               </div>
            </div>
          </div>

          <Textarea 
            placeholder="Type your message..." 
            value={message} 
            onChange={(e) => setMessage(e.target.value)} 
            className="bg-white rounded-[2rem] min-h-[200px] border-none text-black font-bold p-8 text-base shadow-inner focus-visible:ring-2 focus-visible:ring-white/20" 
          />

          <div className="space-y-4">
            <div className="flex justify-between items-center px-6">
              <span className="text-[10px] font-black text-white/60 uppercase tracking-widest">Operation Cost</span>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-black text-white tracking-tighter">{totalCost}</span>
                <Coins className="w-5 h-5 text-yellow-400" />
              </div>
            </div>
            <Button 
              onClick={handleSend} 
              disabled={isSending || !message.trim() || userCoins === null} 
              className="w-full h-18 rounded-full bg-white text-purple-600 font-black uppercase tracking-[0.2em] text-sm shadow-2xl active:scale-95 transition-all py-8"
            >
              {isSending ? <Loader2 className="w-6 h-6 animate-spin" /> : <div className="flex items-center gap-3"><Send className="w-5 h-5" />Blast Message</div>}
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}
