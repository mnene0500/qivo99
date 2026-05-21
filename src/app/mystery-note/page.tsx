"use client"

import { useState, useMemo, useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/firebase/auth/use-user"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ChevronLeft, Coins, Users, Loader2, Send, Sparkles } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

const RECIPIENT_OPTIONS = [2, 5, 10, 20]
const COST_PER_PERSON = 5

export default function MysteryNotePage() {
  const router = useRouter()
  const { user } = useUser()
  const { toast } = useToast()

  const [message, setMessage] = useState("")
  const [recipientCount, setRecipientCount] = useState(2)
  const [isSending, setIsSending] = useState(false)
  const [userCoins, setUserCoins] = useState(0)
  const [profile, setProfile] = useState<any>(null)

  useEffect(() => {
    if (!user?.id) return
    const fetchData = async () => {
      const { data: u } = await supabase.from('users').select('*').eq('uid', user.id).single()
      const { data: b } = await supabase.from('balances').select('coins').eq('user_id', user.id).single()
      if (u) setProfile(u)
      if (b) setUserCoins(b.coins)
    }
    fetchData()
  }, [user?.id])

  const totalCost = recipientCount * COST_PER_PERSON

  const handleSend = async () => {
    if (!user || !profile || !message.trim()) return
    if (userCoins < totalCost) {
      toast({ variant: "destructive", title: "Insufficient Coins", description: `You need ${totalCost} coins.` })
      return
    }

    setIsSending(true)
    try {
      const targetGender = profile.gender === 'male' ? 'female' : 'male'
      
      const { data: targets } = await supabase
        .from('users')
        .select('uid, name, photo_url')
        .eq('gender', targetGender)
        .eq('onboarding_complete', true)
        .neq('uid', user.id)
        .limit(50)

      if (!targets || targets.length < recipientCount) {
        toast({ variant: "destructive", title: "Error", description: "Not enough recipients found." })
        setIsSending(false)
        return
      }

      const shuffled = targets.sort(() => Math.random() - 0.5).slice(0, recipientCount)
      const timestamp = Date.now()

      // Deduct Balance
      await supabase.from('balances').update({ coins: userCoins - totalCost }).eq('user_id', user.id)
      await supabase.from('coin_history').insert({ amount: -totalCost, type: 'mystery_note', description: `Mystery Note to ${recipientCount} people`, timestamp, user_id: user.id })

      for (const target of shuffled) {
        const ids = [user.id, target.uid].sort()
        const chatId = `direct_${ids[0]}_${ids[1]}`
        
        await supabase.from('messages').insert({ chat_id: chatId, text: message.trim(), sender_id: user.id, timestamp })
        await supabase.from('chats').upsert({
          id: chatId,
          last_message: message.trim(),
          last_message_at: timestamp,
          participant_ids: [user.id, target.uid]
        })
      }

      toast({ title: "Note Sent!" })
      router.push("/chats")
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error" })
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="flex-1 bg-[#00A2FF] min-h-screen flex flex-col select-none relative overflow-hidden">
      <div className="absolute -top-10 -right-20 w-80 h-80 opacity-20 pointer-events-none rotate-12"><Sparkles className="w-full h-full text-white" /></div>
      <header className="px-4 h-16 flex items-center bg-transparent z-50">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full text-white hover:bg-white/10"><ChevronLeft className="w-8 h-8" /></Button>
      </header>
      <main className="flex-1 px-6 pt-4 pb-10 space-y-12 overflow-y-auto no-scrollbar relative z-10">
        <div className="space-y-2">
          <h1 className="text-5xl font-black text-white tracking-tighter leading-tight animate-in fade-in slide-in-from-left-4 duration-700">Mystery<br/>Note</h1>
          <p className="text-sm font-bold text-white/70 uppercase tracking-[0.2em] ml-1">Send a secret message</p>
        </div>
        <div className="bg-white/15 backdrop-blur-2xl border border-white/20 rounded-[3rem] p-8 shadow-2xl space-y-8">
          <div className="space-y-4">
            <h2 className="text-2xl font-black text-white leading-tight">Write something<br/>anonymous...</h2>
            <div className="flex flex-wrap items-center gap-3">
               <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-400 rounded-full shadow-lg"><Coins className="w-3.5 h-3.5 text-yellow-800" /><span className="text-[10px] font-black text-yellow-900">5 coins / user</span></div>
               <div className="flex items-center gap-2 px-4 py-1.5 bg-white/10 rounded-full border border-white/20">
                  <Users className="w-3.5 h-3.5 text-white/80" />
                  <select value={recipientCount} onChange={(e) => setRecipientCount(Number(e.target.value))} className="bg-transparent border-none text-[10px] font-black text-white outline-none cursor-pointer uppercase">
                    {RECIPIENT_OPTIONS.map(n => <option key={n} value={n} className="text-black">{n} People</option>)}
                  </select>
               </div>
            </div>
          </div>
          <Textarea placeholder="Type your note..." value={message} onChange={(e) => setMessage(e.target.value)} className="bg-white rounded-[2rem] min-h-[180px] border-none text-black font-bold p-6 text-sm resize-none shadow-inner" />
          <Button onClick={handleSend} disabled={isSending || !message.trim()} className="w-full h-16 rounded-full bg-white text-[#00A2FF] font-black uppercase tracking-[0.2em] text-sm shadow-xl active:scale-95 transition-all">
            {isSending ? <Loader2 className="w-6 h-6 animate-spin" /> : <div className="flex items-center gap-2"><Send className="w-5 h-5" />Blast to {recipientCount} Users</div>}
          </Button>
        </div>
      </main>
    </div>
  )
}
