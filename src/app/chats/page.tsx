
"use client"

import { useEffect, useState, Suspense, useCallback, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { Send, ChevronLeft, User, Gift, Trash2, MoreVertical, BadgeCheck, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useUser } from "@/firebase/auth/use-user"
import { format } from "date-fns"
import { sendGiftAction, clearChatAction, sendMessageAction, markChatAsReadAction } from "@/app/actions/matchflow-actions"
import { useBalance } from "@/lib/providers/BalanceProvider"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"

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
  partner_is_verified?: boolean
  last_message: string
  last_message_at: number
  unread_count: number
}

const GIFTS = [
  { name: "Rose", icon: "🌹", price: 10 },
  { name: "Coffee", icon: "☕", price: 50 },
  { name: "Heart", icon: "❤️", price: 100 },
  { name: "Fire", icon: "🔥", price: 300 },
  { name: "Bouquet", icon: "💐", price: 500 },
  { name: "Unicorn", icon: "🦄", price: 800 },
  { name: "Luxury Car", icon: "🏎️", price: 1000 },
  { name: "Crown", icon: "👑", price: 1500 },
  { name: "Diamond", icon: "💎", price: 2000 },
  { name: "Ring", icon: "💍", price: 3500 },
  { name: "Castle", icon: "🏰", price: 5000 },
  { name: "Yacht", icon: "🚢", price: 10000 },
  { name: "Private Jet", icon: "🛩️", price: 25000 },
  { name: "Island", icon: "🏝️", price: 40000 },
  { name: "Galaxy", icon: "🌌", price: 50000 },
]

let cachedSummaries: ChatSummary[] = [];
const SUMMARY_PAGE_SIZE = 15;
const MESSAGE_PAGE_SIZE = 30;

function ChatsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { toast } = useToast()
  const { user: currentUser, loading: authLoading, isInitialized } = useUser()
  const { coins } = useBalance()
  const startWithId = searchParams.get("startWith")
  
  const [chatSummaries, setChatSummaries] = useState<ChatSummary[]>(cachedSummaries)
  const [loadingSummaries, setLoadingSummaries] = useState(false)
  const [summaryPage, setSummaryPage] = useState(0)
  const [hasMoreSummaries, setHasMoreSummaries] = useState(true)

  const [chatId, setChatId] = useState<string | null>(null)
  const [newMessage, setNewMessage] = useState("")
  const [messages, setMessages] = useState<Message[]>([])
  const [partnerProfile, setPartnerProfile] = useState<any>(null)
  const [activeChatClearedAt, setActiveChatClearedAt] = useState<number>(-1)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [hasMoreMessages, setHasMoreMessages] = useState(true)
  
  const [isGifting, setIsGifting] = useState(false)
  const [giftDialogOpen, setGiftDialogOpen] = useState(false)
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null)

  const observerTarget = useRef<HTMLDivElement>(null)
  const messageObserverTarget = useRef<HTMLDivElement>(null)
  const longPressTimer = useRef<NodeJS.Timeout | null>(null)
  const isLongPress = useRef(false)

  // --------------------------------------------------------------------------
  // CHAT SUMMARIES LOGIC (INFINITE SCROLL)
  // --------------------------------------------------------------------------
  const fetchSummaries = useCallback(async (pageNum = 0) => {
    if (!currentUser?.id || loadingSummaries) return
    if (pageNum === 0) setLoadingSummaries(true)
    
    const from = pageNum * SUMMARY_PAGE_SIZE;
    const to = from + SUMMARY_PAGE_SIZE - 1;

    const { data: chatsData } = await supabase
      .from('chats')
      .select('id, participant_ids, last_message, last_message_at, cleared_at, last_seen_at, last_sender_id')
      .contains('participant_ids', [currentUser.id])
      .order('last_message_at', { ascending: false })
      .range(from, to);

    if (!chatsData) {
      setLoadingSummaries(false);
      return;
    }

    const { data: userData } = await supabase.from('users').select('blocking, blocked_by').eq('uid', currentUser.id).single();
    const blockedUids = new Set([...(userData?.blocking || []), ...(userData?.blocked_by || [])]);

    const validChats = chatsData.filter(c => {
      const pId = c.participant_ids.find((id: string) => id !== currentUser.id)
      if (!pId || blockedUids.has(pId)) return false;
      const myClearedAt = (c.cleared_at as Record<string, number>)?.[currentUser.id] || 0;
      return (c.last_message_at > myClearedAt);
    });

    const partnerIds = validChats.map(c => c.participant_ids.find((id: string) => id !== currentUser.id));
    const { data: profiles } = await supabase.from('users').select('uid, name, photo_url, is_verified').in('uid', partnerIds);
    const profileMap = new Map(profiles?.map(p => [p.uid, p]));

    const enhanced: ChatSummary[] = validChats.map(c => {
      const pId = c.participant_ids.find((id: string) => id !== currentUser.id);
      const p = profileMap.get(pId);
      const mySeenAt = (c.last_seen_at as Record<string, number>)?.[currentUser.id] || 0;
      const isUnread = c.last_message_at > mySeenAt && c.last_sender_id !== currentUser.id;

      return {
        id: c.id,
        partner_id: pId,
        partner_name: p?.name || 'User',
        partner_photo: p?.photo_url || '',
        partner_is_verified: p?.is_verified,
        last_message: c.last_message || "",
        last_message_at: c.last_message_at || Date.now(),
        unread_count: isUnread ? 1 : 0
      }
    });

    if (pageNum === 0) {
      setChatSummaries(enhanced);
      cachedSummaries = enhanced;
    } else {
      setChatSummaries(prev => {
        const ids = new Set(prev.map(s => s.id));
        const filtered = enhanced.filter(s => !ids.has(s.id));
        return [...prev, ...filtered];
      });
      cachedSummaries = [...cachedSummaries, ...enhanced.filter(s => !new Set(cachedSummaries.map(x => x.id)).has(s.id))];
    }
    
    setHasMoreSummaries(chatsData.length === SUMMARY_PAGE_SIZE);
    setSummaryPage(pageNum);
    setLoadingSummaries(false);
  }, [currentUser?.id, loadingSummaries])

  useEffect(() => {
    if (currentUser?.id && !startWithId) {
      if (cachedSummaries.length === 0) fetchSummaries(0)
      const channel = supabase.channel('chats_realtime_summaries')
        .on('postgres_changes', { event: '*', table: 'chats' }, () => fetchSummaries(0))
        .subscribe()
      return () => { supabase.removeChannel(channel) }
    }
  }, [currentUser?.id, startWithId, fetchSummaries])

  // INFINITE SCROLL OBSERVER (SUMMARY LIST)
  useEffect(() => {
    if (!startWithId && hasMoreSummaries) {
      const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && !loadingSummaries) {
          fetchSummaries(summaryPage + 1);
        }
      }, { threshold: 0.1 });
      if (observerTarget.current) observer.observe(observerTarget.current);
      return () => observer.disconnect();
    }
  }, [startWithId, hasMoreSummaries, loadingSummaries, summaryPage, fetchSummaries]);

  // REFRESH EVENT
  useEffect(() => {
    const handleRefresh = (e: any) => {
      if (e.detail.path === '/chats' && !startWithId) {
        fetchSummaries(0);
      }
    }
    window.addEventListener('qivo-nav-refresh', handleRefresh);
    return () => window.removeEventListener('qivo-nav-refresh', handleRefresh);
  }, [fetchSummaries, startWithId])

  // --------------------------------------------------------------------------
  // CONVERSATION LOGIC (FETCH ON SCROLL UP)
  // --------------------------------------------------------------------------
  const fetchMessagesBatch = useCallback(async (isLoadMore = false) => {
    if (!chatId || activeChatClearedAt === -1 || loadingMessages) return;
    if (isLoadMore && !hasMoreMessages) return;

    setLoadingMessages(true);
    let query = supabase
      .from('messages')
      .select('id, text, sender_id, timestamp, is_gift')
      .eq('chat_id', chatId)
      .gt('timestamp', activeChatClearedAt)
      .order('timestamp', { ascending: false })
      .limit(MESSAGE_PAGE_SIZE);

    if (isLoadMore && messages.length > 0) {
      const oldestVisibleTimestamp = messages[messages.length - 1].timestamp;
      query = query.lt('timestamp', oldestVisibleTimestamp);
    }

    const { data, error } = await query;

    if (!error && data) {
      if (isLoadMore) {
        setMessages(prev => [...prev, ...data]);
      } else {
        setMessages(data);
      }
      setHasMoreMessages(data.length === MESSAGE_PAGE_SIZE);
    }
    setLoadingMessages(false);
  }, [chatId, activeChatClearedAt, messages, hasMoreMessages, loadingMessages]);

  // SCROLL UP OBSERVER (MESSAGES)
  useEffect(() => {
    if (startWithId && hasMoreMessages) {
      const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && !loadingMessages) {
          fetchMessagesBatch(true);
        }
      }, { threshold: 0.1 });
      if (messageObserverTarget.current) observer.observe(messageObserverTarget.current);
      return () => observer.disconnect();
    }
  }, [startWithId, hasMoreMessages, loadingMessages, fetchMessagesBatch]);

  useEffect(() => {
    if (currentUser?.id && startWithId) {
      const ids = [currentUser.id, startWithId].sort()
      const cId = `direct_${ids[0]}_${ids[1]}`
      setMessages([])
      setChatId(cId)
      setHasMoreMessages(true);
      markChatAsReadAction(currentUser.id, cId);
      
      Promise.all([
        supabase.from('users').select('uid, name, photo_url, is_verified').eq('uid', startWithId).maybeSingle(),
        supabase.from('chats').select('cleared_at').eq('id', cId).maybeSingle()
      ]).then(([pRes, cRes]) => {
        setPartnerProfile(pRes.data)
        const cleared = (cRes.data?.cleared_at as Record<string, number>)?.[currentUser.id] || 0
        setActiveChatClearedAt(cleared)
      })
    }
  }, [currentUser?.id, startWithId])

  useEffect(() => {
    if (chatId && activeChatClearedAt !== -1) {
      fetchMessagesBatch(false);
      const channel = supabase.channel(`messages:${chatId}`)
        .on('postgres_changes', { event: 'INSERT', table: 'messages', filter: `chat_id=eq.${chatId}` }, (payload) => {
          const newMsg = payload.new as Message
          if (newMsg.timestamp <= activeChatClearedAt) return
          setMessages(prev => {
            const matched = prev.find(m => m.is_optimistic && Math.abs(m.timestamp - newMsg.timestamp) < 3000);
            if (matched) return [newMsg, ...prev.filter(m => m.id !== matched.id)];
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return [newMsg, ...prev];
          });
        }).subscribe()
      return () => { supabase.removeChannel(channel) }
    }
  }, [chatId, activeChatClearedAt]);

  const handleSendMessage = useCallback(async () => {
    const text = newMessage.trim()
    if (!text || !chatId || !currentUser?.id || !startWithId) return
    const timestamp = Date.now()
    const optimisticMsg: Message = { id: `temp-${timestamp}`, text, sender_id: currentUser.id, timestamp, is_optimistic: true }
    setMessages(prev => [optimisticMsg, ...prev])
    setNewMessage("")
    const res = await sendMessageAction({ chatId, senderId: currentUser.id, recipientId: startWithId, text });
    if (!res.success) {
      setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id))
      toast({ variant: "destructive", title: res.error === 'insufficient_funds' ? "Insufficient Coins" : "Error" })
    }
  }, [chatId, currentUser?.id, newMessage, startWithId, toast]);

  const handleSendGift = async (gift: typeof GIFTS[0]) => {
    if (!currentUser?.id || !startWithId || !chatId) return;
    const { data: bal } = await supabase.from('balances').select('coins').eq('user_id', currentUser.id).single();
    const { data: userPrf } = await supabase.from('users').select('is_owner, is_special_user').eq('uid', currentUser.id).single();
    const isFree = userPrf?.is_owner || userPrf?.is_special_user;
    if (!isFree && (Number(bal?.coins) || 0) < gift.price) {
      toast({ variant: "destructive", title: "Insufficient Coins" });
      setGiftDialogOpen(false);
      return;
    }
    setIsGifting(true);
    setGiftDialogOpen(false);
    const ts = Date.now();
    const optimistic: Message = { id: `gift-${ts}`, text: `[Gift: ${gift.name}]`, sender_id: currentUser.id, timestamp: ts, is_gift: true, is_optimistic: true };
    setMessages(prev => [optimistic, ...prev]);
    const res = await sendGiftAction(currentUser.id, startWithId, gift.price, gift.name);
    if (!res.success) {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      toast({ variant: "destructive", title: "Failed" });
    }
    setIsGifting(false);
  }

  const handleTouchStart = (id: string) => {
    isLongPress.current = false
    longPressTimer.current = setTimeout(() => { isLongPress.current = true; setDeletingChatId(id) }, 400)
  }

  const handleTouchEnd = (partnerId: string) => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    if (!isLongPress.current) router.push(`/chats?startWith=${partnerId}`)
  }

  if (authLoading || !isInitialized) return null;

  // --------------------------------------------------------------------------
  // RENDER CHAT LIST
  // --------------------------------------------------------------------------
  if (!startWithId) return (
    <div className="flex-1 bg-white min-h-screen relative select-none">
      <header className="px-6 h-16 flex items-center border-b sticky top-0 bg-white/90 backdrop-blur-md z-[50]">
        <h1 className="text-3xl font-logo text-[#00A2FF]">Chats</h1>
      </header>
      <main className="flex flex-col">
        {chatSummaries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-40 opacity-40 px-12 text-center text-gray-300">
            <User className="w-12 h-12 mb-4" /><p className="font-bold text-xs uppercase tracking-widest">No conversations</p>
          </div>
        ) : (
          <>
            {chatSummaries.map(s => (
              <div key={s.id} onPointerDown={() => handleTouchStart(s.id)} onPointerUp={() => handleTouchEnd(s.partner_id)} className="p-5 flex items-center gap-4 active:bg-gray-50 border-b border-gray-50 transition-colors cursor-pointer touch-none">
                <div className="relative">
                  <Avatar className="w-14 h-14 border"><AvatarImage src={s.partner_photo} className="object-cover" /><AvatarFallback>{s.partner_name[0]}</AvatarFallback></Avatar>
                  {s.unread_count > 0 && <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-black w-6 h-6 rounded-full flex items-center justify-center border-2 border-white shadow-sm">{s.unread_count}</div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between mb-1">
                    <div className="flex items-center gap-1.5 min-w-0"><p className="text-sm font-black truncate">{s.partner_name}</p>{s.partner_is_verified && <BadgeCheck className="w-3.5 h-3.5 text-[#00A2FF] fill-blue-50 shrink-0" />}</div>
                    <span className="text-[9px] font-bold text-gray-300 uppercase shrink-0">{format(s.last_message_at, "HH:mm")}</span>
                  </div>
                  <p className={cn("text-xs truncate", s.unread_count > 0 ? "font-bold text-black" : "text-gray-400")}>{s.last_message}</p>
                </div>
              </div>
            ))}
            <div ref={observerTarget} className="h-20 flex items-center justify-center">
              {hasMoreSummaries && <Loader2 className="w-4 h-4 animate-spin text-[#00A2FF]" />}
            </div>
          </>
        )}
      </main>

      <AlertDialog open={!!deletingChatId} onOpenChange={(open) => !open && setDeletingChatId(null)}>
        <AlertDialogContent className="rounded-[2.5rem] max-w-[85vw] p-8 border-none shadow-2xl">
          <AlertDialogHeader className="items-center text-center"><AlertDialogTitle className="text-xl font-bold">Delete Conversation?</AlertDialogTitle><AlertDialogDescription className="text-xs uppercase font-bold tracking-widest text-gray-400">History will be cleared.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter className="flex flex-row items-center justify-center gap-4 mt-6">
            <AlertDialogCancel className="flex-1 h-14 rounded-full bg-gray-50">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deletingChatId) clearChatAction(currentUser!.id, deletingChatId); setDeletingChatId(null); fetchSummaries(0); }} className="flex-1 h-14 rounded-full bg-red-500">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )

  // --------------------------------------------------------------------------
  // RENDER CONVERSATION
  // --------------------------------------------------------------------------
  return (
    <div className="flex flex-col h-screen bg-white select-none overflow-hidden">
      <header className="h-16 border-b flex items-center px-4 gap-4 bg-white z-[50] sticky top-0">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full"><ChevronLeft className="w-6 h-6 text-black" /></Button>
        <div className="flex items-center gap-3 flex-1 cursor-pointer active:opacity-70 transition-opacity min-w-0" onClick={() => router.push(`/users/${startWithId}`)}>
          <Avatar className="w-10 h-10 border shrink-0"><AvatarImage src={partnerProfile?.photo_url} className="object-cover" /><AvatarFallback>{partnerProfile?.name?.[0]}</AvatarFallback></Avatar>
          <div className="min-w-0 flex items-center gap-1.5"><p className="font-black text-sm leading-none truncate">{partnerProfile?.name || '...'}</p>{partnerProfile?.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-[#00A2FF] fill-blue-50 shrink-0" />}</div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="rounded-full text-gray-400"><MoreVertical className="w-5 h-5" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="rounded-2xl min-w-[160px]">
            <AlertDialog>
              <AlertDialogTrigger asChild><DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-red-500 font-bold gap-2"><Trash2 className="w-4 h-4" /> Delete Chat</DropdownMenuItem></AlertDialogTrigger>
              <AlertDialogContent className="rounded-[2.5rem] max-w-[85vw] p-8 border-none"><AlertDialogHeader className="items-center text-center"><AlertDialogTitle className="text-xl font-bold">Delete Chat?</AlertDialogTitle></AlertDialogHeader><AlertDialogFooter className="flex flex-row items-center justify-center gap-4 mt-6"><AlertDialogCancel className="flex-1 h-14 rounded-full bg-gray-50">Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { clearChatAction(currentUser!.id, chatId!); router.push("/chats"); }} className="flex-1 h-14 rounded-full bg-red-500">Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
            </AlertDialog>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      
      <main className="flex-1 overflow-y-auto p-6 flex flex-col-reverse gap-4 bg-gray-50 no-scrollbar">
        {messages.map(m => {
          const isMe = m.sender_id === currentUser?.id;
          const gift = m.is_gift ? GIFTS.find(g => m.text.includes(g.name)) : null;
          return (
            <div key={m.id} className={cn("max-w-[80%] p-4 rounded-[2rem] text-sm font-medium shadow-sm relative animate-in fade-in slide-in-from-bottom-2", 
              isMe ? "bg-[#00A2FF] text-white self-end rounded-br-none" : "bg-white text-black self-start rounded-bl-none border",
              m.is_gift && "bg-gradient-to-br from-pink-500 to-rose-600 text-white border-none p-6 flex flex-col items-center text-center gap-3"
            )}>
              {m.is_gift ? (<><div className="text-5xl">{gift?.icon || "🎁"}</div><p className="font-black uppercase tracking-widest text-[10px]">{gift?.name || "Premium Gift"}</p>{isMe && <Button size="sm" onClick={() => handleSendGift(gift!)} className="mt-2 h-8 rounded-full bg-white/20 text-white text-[9px] uppercase font-black">Send Again</Button>}</>) : m.text}
            </div>
          )
        })}
        <div ref={messageObserverTarget} className="h-10 flex items-center justify-center py-4">
          {hasMoreMessages && <Loader2 className="w-4 h-4 animate-spin text-gray-300" />}
        </div>
      </main>

      <footer className="p-4 border-t bg-white pb-[env(safe-area-inset-bottom)] z-[50] sticky bottom-0">
        <div className="flex items-center gap-2">
          <Dialog open={giftDialogOpen} onOpenChange={setGiftDialogOpen}>
            <DialogTrigger asChild><Button size="icon" variant="ghost" className="rounded-full h-12 w-12 text-pink-500"><Gift className="w-6 h-6" /></Button></DialogTrigger>
            <DialogContent className="rounded-[2.5rem] p-0 max-w-[95vw]">
              <DialogHeader className="p-6 pb-2"><DialogTitle className="text-lg font-black uppercase">Gifts ({coins} Coins)</DialogTitle></DialogHeader>
              <div className="grid grid-cols-3 gap-2 p-6 pt-0 max-h-[50vh] overflow-y-auto no-scrollbar">
                {GIFTS.map((gift) => (
                  <button key={gift.name} onClick={() => handleSendGift(gift)} disabled={isGifting} className="flex flex-col items-center p-3 bg-gray-50 rounded-2xl active:scale-95 transition-all">
                    <span className="text-3xl">{gift.icon}</span><span className="text-[9px] font-black uppercase mt-1">{gift.name}</span><span className="text-[8px] font-bold text-[#00A2FF]">{gift.price}</span>
                  </button>
                ))}
              </div>
            </DialogContent>
          </Dialog>
          <input value={newMessage} onChange={e => setNewMessage(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()} className="flex-1 h-12 bg-gray-50 rounded-2xl px-5 text-sm font-bold outline-none" placeholder="Type something..." />
          <Button onClick={() => handleSendMessage()} size="icon" className="rounded-full h-12 w-12 bg-[#00A2FF] shrink-0"><Send className="w-5 h-5" /></Button>
        </div>
      </footer>
    </div>
  )
}

export default function ChatsPage() { return <Suspense fallback={null}><ChatsContent /></Suspense> }
