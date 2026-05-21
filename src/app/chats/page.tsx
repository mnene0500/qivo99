"use client"

import { useEffect, useState, Suspense, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { BottomNav } from "@/components/layout/BottomNav"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { Send, ChevronLeft, Loader2, User, Trash2, MoreVertical, Sparkles, AlertCircle, Gift } from "lucide-react"
import { cn } from "@/lib/utils"
import { useUser } from "@/firebase/auth/use-user"
import { format } from "date-fns"
import { sendGiftAction } from "@/app/actions/matchflow-actions"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface Message {
  id: string | number
  text: string
  sender_id: string
  timestamp: number
  is_gift?: boolean
  is_optimistic?: boolean
}

interface ChatSummary {
  id: string
  partner_id: string
  partner_name: string
  partner_photo: string
  last_message: string
  last_message_at: number
  unread_count: number
  cleared_at?: Record<string, number>
  last_seen_at?: Record<string, number>
}

function ChatsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { toast } = useToast()
  const { user: currentUser } = useUser()
  const startWithId = searchParams.get("startWith")
  
  const [chatId, setChatId] = useState<string | null>(null)
  const [newMessage, setNewMessage] = useState("")
  const [messages, setMessages] = useState<Message[]>([])
  const [chatSummaries, setChatSummaries] = useState<ChatSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [partnerProfile, setPartnerProfile] = useState<any>(null)
  const [userProfile, setUserProfile] = useState<any>(null)
  const [userBalance, setUserBalance] = useState<number>(0)
  const [isSending, setIsSending] = useState(false)
  const [activeChatClearedAt, setActiveChatClearedAt] = useState<number>(0)
  
  const [chatToDelete, setChatToDelete] = useState<ChatSummary | null>(null)
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null)
  const [isLongPressing, setIsLongPressing] = useState(false)

  // 1. Mark Chat as Seen
  const markAsSeen = async (id: string) => {
    if (!currentUser?.id) return
    const { data } = await supabase.from('chats').select('last_seen_at').eq('id', id).single()
    const newSeenAt = { ...(data?.last_seen_at || {}), [currentUser.id]: Date.now() }
    await supabase.from('chats').update({ last_seen_at: newSeenAt }).eq('id', id)
  }

  // 2. Fetch User Info & Balance
  useEffect(() => {
    if (!currentUser?.id) return
    const fetchMyInfo = async () => {
      const { data: p } = await supabase.from('users').select('*').eq('uid', currentUser.id).single()
      const { data: b } = await supabase.from('balances').select('coins').eq('user_id', currentUser.id).single()
      if (p) setUserProfile(p)
      if (b) setUserBalance(b.coins || 0)
    }
    fetchMyInfo()
    
    const balChan = supabase.channel(`my-bal-${currentUser.id}`)
      .on('postgres_changes', { event: 'UPDATE', table: 'balances', filter: `user_id=eq.${currentUser.id}` }, (payload) => {
        setUserBalance(payload.new.coins)
      }).subscribe()
    
    return () => { supabase.removeChannel(balChan) }
  }, [currentUser?.id])

  // 3. Fetch Chat List (Summaries)
  useEffect(() => {
    if (!currentUser?.id || startWithId) return
    
    const fetchSummaries = async () => {
      const { data: chatsData } = await supabase
        .from('chats')
        .select('*')
        .contains('participant_ids', [currentUser.id])
        .order('last_message_at', { ascending: false })

      if (chatsData) {
        const enhanced = await Promise.all(chatsData.map(async (c) => {
          const pId = c.participant_ids.find((id: string) => id !== currentUser.id)
          if (!pId) return null;

          const userClearedAt = c.cleared_at?.[currentUser.id] || 0
          if (c.last_message_at <= userClearedAt) return null

          const userSeenAt = c.last_seen_at?.[currentUser.id] || 0
          const isUnread = c.last_message_at > userSeenAt && c.participant_ids[0] !== currentUser.id // Simplified check

          const { data: p } = await supabase.from('users').select('name, photo_url').eq('uid', pId).single()
          return {
            id: c.id,
            partner_id: pId,
            partner_name: p?.name || `User ${pId?.slice(0, 4)}`,
            partner_photo: p?.photo_url || "",
            last_message: c.last_message || "",
            last_message_at: c.last_message_at || Date.now(),
            unread_count: isUnread ? 1 : 0,
            cleared_at: c.cleared_at
          } as ChatSummary
        }))
        setChatSummaries(enhanced.filter(Boolean) as ChatSummary[])
      }
      setLoading(false)
    }

    fetchSummaries()
    const channel = supabase.channel('chats_realtime').on('postgres_changes', { event: '*', table: 'chats' }, () => fetchSummaries()).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [currentUser?.id, startWithId])

  // 4. Handle Active Chat
  useEffect(() => {
    if (currentUser?.id && startWithId) {
      const ids = [currentUser.id, startWithId].sort()
      const cId = `direct_${ids[0]}_${ids[1]}`
      setChatId(cId)
      markAsSeen(cId)
      supabase.from('users').select('*').eq('uid', startWithId).single().then(({ data }) => setPartnerProfile(data))
      supabase.from('chats').select('cleared_at').eq('id', cId).single().then(({ data }) => {
        if (data) setActiveChatClearedAt(data.cleared_at?.[currentUser.id] || 0)
      })
    } else {
      setChatId(null)
      setPartnerProfile(null)
    }
  }, [currentUser?.id, startWithId])

  // 5. Message Listener
  useEffect(() => {
    if (!chatId) return
    const fetchMessages = async () => {
      const { data } = await supabase.from('messages').select('*').eq('chat_id', chatId).gt('timestamp', activeChatClearedAt).order('timestamp', { ascending: false }).limit(50)
      if (data) setMessages(data)
    }
    fetchMessages()
    const channel = supabase.channel(`messages:${chatId}`).on('postgres_changes', { event: 'INSERT', table: 'messages', filter: `chat_id=eq.${chatId}` }, (payload) => {
      const newMsg = payload.new as Message
      if (newMsg.timestamp <= activeChatClearedAt) return
      setMessages(prev => {
        if (prev.some(m => m.text === newMsg.text && Math.abs(m.timestamp - newMsg.timestamp) < 5000)) return prev
        return [newMsg, ...prev]
      })
      markAsSeen(chatId)
    }).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [chatId, activeChatClearedAt])

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !chatId || !currentUser?.id || !startWithId || !userProfile) return
    const isMan = userProfile.gender === 'male'
    const cost = 15
    if (isMan && userBalance < cost) {
      toast({ variant: "destructive", title: "Insufficient Coins", description: "Men need 15 coins per message." })
      router.push("/recharge")
      return
    }

    const text = newMessage.trim()
    const timestamp = Date.now()
    const optimisticMsg: Message = { id: `temp-${timestamp}`, text, sender_id: currentUser.id, timestamp, is_optimistic: true }
    setMessages(prev => [optimisticMsg, ...prev])
    setNewMessage("")

    try {
      if (isMan) {
        await supabase.from('balances').update({ coins: userBalance - cost }).eq('user_id', currentUser.id)
        await supabase.from('coin_history').insert({ user_id: currentUser.id, amount: -cost, type: 'chat', description: `Chat with ${partnerProfile?.name || 'User'}`, timestamp })
      }
      await Promise.all([
        supabase.from('chats').upsert({ id: chatId, last_message: text, last_message_at: timestamp, participant_ids: [currentUser.id, startWithId] }, { onConflict: 'id' }),
        supabase.from('messages').insert({ chat_id: chatId, text, sender_id: currentUser.id, timestamp })
      ])
    } catch (err) {
      setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id))
      toast({ variant: "destructive", title: "Message Failed" })
    }
  }

  const handleSendGift = async () => {
    if (!currentUser || !startWithId) return
    const res = await sendGiftAction(currentUser.id, startWithId, 200, "Rose")
    if (res.success) toast({ title: "Gift Sent!" })
    else toast({ variant: "destructive", title: "Error", description: res.error })
  }

  const handleClearChat = async (targetId?: string) => {
    const id = targetId || chatId
    if (!id || !currentUser?.id) return
    const now = Date.now()
    try {
      const { data: existing } = await supabase.from('chats').select('cleared_at').eq('id', id).single()
      const newClearedAt = { ...(existing?.cleared_at || {}), [currentUser.id]: now }
      await supabase.from('chats').update({ cleared_at: newClearedAt }).eq('id', id)
      if (!targetId) { router.push('/chats') } else { setChatSummaries(prev => prev.filter(s => s.id !== targetId)) }
      toast({ title: "Chat cleared" })
    } catch (err) { toast({ variant: "destructive", title: "Failed to clear" }) }
  }

  const handleTouchStart = (chat: ChatSummary) => {
    setIsLongPressing(false)
    const timer = setTimeout(() => { setIsLongPressing(true); setChatToDelete(chat); }, 600)
    setLongPressTimer(timer)
  }

  const handleTouchEnd = (chat: ChatSummary) => {
    if (longPressTimer) { clearTimeout(longPressTimer); setLongPressTimer(null); }
    if (!isLongPressing) { router.push(`/chats?startWith=${chat.partner_id}`) }
  }

  if (!startWithId) return (
    <div className="flex-1 bg-white min-h-screen pb-20 select-none">
      <header className="px-6 h-16 flex items-center border-b sticky top-0 bg-white/80 backdrop-blur-md z-50 justify-between">
        <h1 className="text-3xl font-logo text-[#00A2FF] tracking-tight">Chats</h1>
        <Sparkles className="w-5 h-5 text-blue-100" />
      </header>
      <main className="flex flex-col">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 opacity-20"><Loader2 className="w-8 h-8 animate-spin text-[#00A2FF]" /></div>
        ) : chatSummaries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 px-12 text-center opacity-40">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4"><User className="w-8 h-8 text-gray-400" /></div>
            <p className="font-bold text-sm text-black uppercase tracking-widest">No conversations yet</p>
          </div>
        ) : chatSummaries.map(s => (
          <div key={s.id} onMouseDown={() => handleTouchStart(s)} onMouseUp={() => handleTouchEnd(s)} onMouseLeave={() => { if(longPressTimer) clearTimeout(longPressTimer) }} onTouchStart={() => handleTouchStart(s)} onTouchEnd={() => handleTouchEnd(s)} className="p-5 border-b border-gray-50 flex items-center gap-4 active:bg-gray-50 transition-colors cursor-pointer relative">
            <div className="relative">
              <Avatar className="w-14 h-14 border border-gray-100"><AvatarImage src={s.partner_photo} className="object-cover" /><AvatarFallback>{s.partner_name?.[0]}</AvatarFallback></Avatar>
              {s.unread_count > 0 && <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-black w-5 h-5 rounded-full flex items-center justify-center border-2 border-white animate-in zoom-in">NEW</div>}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center mb-1">
                <p className={cn("text-sm truncate", s.unread_count > 0 ? "font-black text-black" : "font-bold text-gray-700")}>{s.partner_name}</p>
                <span className="text-[9px] font-bold text-gray-300 uppercase">{format(s.last_message_at, "HH:mm")}</span>
              </div>
              <p className={cn("text-xs truncate leading-relaxed", s.unread_count > 0 ? "font-bold text-black" : "font-medium text-gray-400")}>{s.last_message}</p>
            </div>
          </div>
        ))}
      </main>

      <AlertDialog open={!!chatToDelete} onOpenChange={(open) => !open && setChatToDelete(null)}>
        <AlertDialogContent className="rounded-[2.5rem] max-w-[85vw] p-8 border-none shadow-2xl">
          <AlertDialogHeader className="items-center text-center">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4"><AlertCircle className="w-8 h-8 text-red-500" /></div>
            <AlertDialogTitle className="text-xl font-bold tracking-tight">Delete Chat?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs font-bold text-gray-400 uppercase tracking-widest leading-relaxed">This will remove the chat from your list.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-3 mt-6">
            <AlertDialogCancel className="flex-1 h-14 rounded-full border-2 font-bold uppercase text-[10px] tracking-widest mt-0">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => chatToDelete && handleClearChat(chatToDelete.id)} className="flex-1 h-14 rounded-full bg-red-500 hover:bg-red-600 font-bold uppercase text-[10px] tracking-widest">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <BottomNav />
    </div>
  )

  return (
    <div className="flex flex-col h-screen bg-white select-none">
      <header className="h-16 border-b flex items-center px-4 gap-4 sticky top-0 bg-white z-50">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full"><ChevronLeft className="w-6 h-6 text-black" /></Button>
        <div className="flex items-center gap-3 flex-1">
          <Avatar className="w-9 h-9"><AvatarImage src={partnerProfile?.photo_url} className="object-cover" /><AvatarFallback>{partnerProfile?.name?.[0]}</AvatarFallback></Avatar>
          <div className="flex flex-col">
            <span className="font-black text-sm text-black leading-none">{partnerProfile?.name || '...'}</span>
            <span className="text-[9px] font-bold text-green-500 uppercase tracking-widest mt-1">Online</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={handleSendGift} className="rounded-full text-pink-500"><Gift className="w-5 h-5" /></Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="rounded-full"><MoreVertical className="w-5 h-5 text-gray-400" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-2xl min-w-[160px]"><DropdownMenuItem onClick={() => handleClearChat()} className="text-red-500 font-bold gap-2 p-3"><Trash2 className="w-4 h-4" /> Delete Chat</DropdownMenuItem></DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6 flex flex-col-reverse gap-4 bg-[#F9FAFB]">
        {messages.map(m => (
          <div key={m.id} className={cn("max-w-[80%] p-4 rounded-3xl text-sm font-medium shadow-sm", m.sender_id === currentUser?.id ? "bg-[#00A2FF] text-white self-end rounded-br-none" : "bg-white text-black self-start rounded-bl-none border border-black/5", m.is_optimistic && "opacity-60", m.is_gift && "bg-gradient-to-br from-pink-500 to-rose-400 text-white italic")}>
            {m.text}
          </div>
        ))}
      </main>

      <footer className="p-4 pb-8 border-t bg-white flex flex-col gap-2">
        {userProfile?.gender === 'male' && <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest px-2 mb-1">Message cost: 15 Coins</div>}
        <div className="flex gap-2 items-center">
          <input value={newMessage} onChange={e => setNewMessage(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()} className="flex-1 h-12 bg-gray-50 rounded-2xl px-5 text-sm font-bold placeholder:text-gray-300 outline-none" placeholder="Say something nice..." />
          <Button onClick={handleSendMessage} disabled={!newMessage.trim() || isSending} size="icon" className="rounded-full h-12 w-12 bg-[#00A2FF] hover:bg-[#0081CC] shadow-lg"><Send className="w-5 h-5 text-white" /></Button>
        </div>
      </footer>
    </div>
  )
}

export default function ChatsPage() { return <Suspense fallback={<div className="h-screen flex items-center justify-center bg-white"><Loader2 className="animate-spin text-[#00A2FF]" /></div>}><ChatsContent /></Suspense> }
