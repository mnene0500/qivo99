
"use client"

import { useEffect, useState, Suspense, useCallback, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { Send, ChevronLeft, User, Gift, Trash2, MoreVertical, BadgeCheck, Loader2, Ban, Flag, PlusCircle, Coins, Heart, Star, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { useUser } from "@/firebase/auth/use-user"
import { format } from "date-fns"
import { clearChatAction, sendMessageAction, markChatAsReadAction, sendGiftAction } from "@/app/actions/matchflow-actions"
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

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
  { name: "Rose", cost: 15, icon: "🌹" },
  { name: "Heart", cost: 50, icon: "❤️" },
  { name: "Crown", cost: 200, icon: "👑" },
  { name: "Diamond", cost: 500, icon: "💎" },
  { name: "Supercar", cost: 1000, icon: "🏎️" },
  { name: "Private Jet", cost: 5000, icon: "🛩️" }
]

function ChatsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { toast } = useToast()
  const { user: currentUser, isInitialized } = useUser()
  const startWithId = searchParams.get("startWith")
  
  const [chatSummaries, setChatSummaries] = useState<ChatSummary[]>([])
  const [loadingSummaries, setLoadingSummaries] = useState(false)
  const [chatId, setChatId] = useState<string | null>(null)
  const [newMessage, setNewMessage] = useState("")
  const [messages, setMessages] = useState<Message[]>([])
  const [partnerProfile, setPartnerProfile] = useState<any>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [chatToDelete, setChatToDelete] = useState<string | null>(null)
  const [giftOpen, setGiftOpen] = useState(false)

  const longPressTimer = useRef<NodeJS.Timeout | null>(null)

  // 1. Fetch Chat Summaries
  const fetchSummaries = useCallback(async () => {
    if (!currentUser?.id) return
    setLoadingSummaries(true)

    try {
      const { data: chatsData } = await supabase
        .from('chats')
        .select('*')
        .contains('participant_ids', [currentUser.id])
        .order('last_message_at', { ascending: false });

      if (!chatsData) {
        setChatSummaries([])
        return
      }

      // Filter: Show chat if NEW messages exist since clearing
      const filteredChats = chatsData.filter(c => {
        const clearedAt = (c.cleared_at as Record<string, number>)?.[currentUser.id] || 0;
        return (c.last_message_at || 0) > clearedAt;
      });

      if (filteredChats.length === 0) {
        setChatSummaries([])
        return
      }

      const partnerIds = Array.from(new Set(filteredChats.map(c => c.participant_ids.find((id: string) => id !== currentUser.id))));
      const { data: profiles } = await supabase.from('users').select('uid, name, photo_url, is_verified').in('uid', partnerIds);
      const profileMap = new Map(profiles?.map(p => [p.uid, p]));

      const enhanced: ChatSummary[] = filteredChats.map(c => {
        const pId = c.participant_ids.find((id: string) => id !== currentUser.id);
        const p = profileMap.get(pId);
        const mySeenAt = (c.last_seen_at as Record<string, number>)?.[currentUser.id] || 0;
        const lastMsgAt = c.last_message_at || 0;
        
        return {
          id: c.id,
          partner_id: pId!,
          partner_name: p?.name || 'User',
          partner_photo: p?.photo_url || '',
          partner_is_verified: p?.is_verified,
          last_message: c.last_message || "",
          last_message_at: lastMsgAt,
          unread_count: (lastMsgAt > mySeenAt && c.last_sender_id !== currentUser.id) ? 1 : 0
        };
      });

      setChatSummaries(enhanced);
    } finally {
      setLoadingSummaries(false);
    }
  }, [currentUser?.id]);

  // 2. Fetch Chat Details
  useEffect(() => {
    if (!startWithId || !currentUser?.id) return;

    const cid = `direct_${[currentUser.id, startWithId].sort()[0]}_${[currentUser.id, startWithId].sort()[1]}`;
    setChatId(cid);
    setLoadingDetail(true);

    // Fetch Partner Immediately
    supabase.from('users').select('*').eq('uid', startWithId).single().then(({ data }) => {
      setPartnerProfile(data);
    });

    // Fetch Messages relative to cleared timestamp
    supabase.from('chats').select('cleared_at').eq('id', cid).maybeSingle().then(({ data: chatMeta }) => {
      const clearedAt = (chatMeta?.cleared_at as Record<string, number>)?.[currentUser.id] || 0;
      
      supabase.from('messages')
        .select('*')
        .eq('chat_id', cid)
        .gt('timestamp', clearedAt)
        .order('timestamp', { ascending: false })
        .limit(50)
        .then(({ data }) => {
          setMessages(data || []);
          setLoadingDetail(false);
        });
    });

    markChatAsReadAction(currentUser.id, cid);

    const channel = supabase.channel(`chat-msgs-${cid}`)
      .on('postgres_changes', { event: 'INSERT', table: 'messages', filter: `chat_id=eq.${cid}` }, (payload) => {
        setMessages(prev => [payload.new as any, ...prev.filter(m => m.id !== (payload.new as any).id)]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel) };
  }, [startWithId, currentUser?.id]);

  useEffect(() => {
    if (currentUser?.id && !startWithId) {
      fetchSummaries();
    }
  }, [currentUser?.id, startWithId, fetchSummaries]);

  const handleSendMessage = async () => {
    const text = newMessage.trim();
    if (!text || !chatId || !currentUser?.id || !startWithId) return;
    
    const ts = Date.now();
    const optimistic = { id: `temp-${ts}`, text, sender_id: currentUser.id, timestamp: ts, is_optimistic: true };
    setMessages(prev => [optimistic, ...prev]);
    setNewMessage("");

    const res = await sendMessageAction({ chatId, senderId: currentUser.id, recipientId: startWithId, text });
    if (!res.success) {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      toast({ variant: "destructive", title: res.error === 'insufficient_funds' ? "Insufficient Coins" : "Error sending message" });
    }
  };

  const handleSendGift = async (gift: typeof GIFTS[0]) => {
    if (!currentUser || !startWithId) return
    setGiftOpen(false)
    
    const res = await sendGiftAction(currentUser.id, startWithId, gift.cost, gift.name)
    if (res.success) {
      toast({ title: `${gift.name} Sent!` })
      const ts = Date.now();
      setMessages(prev => [{ id: `gift-${ts}`, text: `[Gift: ${gift.name}]`, sender_id: currentUser.id, timestamp: ts }, ...prev]);
    } else {
      toast({ variant: "destructive", title: res.error === 'insufficient_funds' ? "Insufficient Coins" : "Failed to send gift" })
    }
  }

  const handleClearChat = async () => {
    if (!chatToDelete || !currentUser?.id) return
    const res = await clearChatAction(currentUser.id, chatToDelete)
    if (res.success) {
      setChatSummaries(prev => prev.filter(s => s.id !== chatToDelete))
      toast({ title: "Chat history cleared" })
    }
    setChatToDelete(null)
  }

  const onTouchStart = (cid: string) => {
    longPressTimer.current = setTimeout(() => {
      setChatToDelete(cid)
    }, 800)
  }

  const onTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  if (!isInitialized) return null;

  if (!startWithId) return (
    <div className="flex-1 bg-white min-h-screen relative select-none">
      <header className="px-6 h-16 flex items-center border-b sticky top-0 bg-white/90 backdrop-blur-md z-[50]">
        <h1 className="text-2xl font-black text-[#00A2FF] tracking-tight">Chats</h1>
      </header>
      <main className="flex flex-col pb-24">
        {chatSummaries.length === 0 && !loadingSummaries ? (
          <div className="flex flex-col items-center justify-center py-40 opacity-40 px-12 text-center text-gray-300">
            <User className="w-12 h-12 mb-4" /><p className="font-bold text-xs uppercase tracking-widest">No conversations</p>
          </div>
        ) : (
          chatSummaries.map(s => (
            <div 
              key={s.id} 
              onMouseDown={() => onTouchStart(s.id)}
              onMouseUp={onTouchEnd}
              onMouseLeave={onTouchEnd}
              onTouchStart={() => onTouchStart(s.id)}
              onTouchEnd={onTouchEnd}
              onClick={() => router.push(`/chats?startWith=${s.partner_id}`)} 
              className="p-4 flex items-center gap-4 active:bg-gray-50 border-b border-gray-50 transition-colors cursor-pointer"
            >
              <div className="relative">
                <Avatar className="w-14 h-14 border"><AvatarImage src={s.partner_photo} /><AvatarFallback>{s.partner_name[0]}</AvatarFallback></Avatar>
                {s.unread_count > 0 && <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-black w-6 h-6 rounded-full flex items-center justify-center border-2 border-white shadow-sm">{s.unread_count}</div>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between mb-1">
                  <div className="flex items-center gap-1.5 min-w-0"><p className="text-sm font-black truncate">{s.partner_name}</p>{s.partner_is_verified && <BadgeCheck className="w-3.5 h-3.5 text-[#00A2FF] fill-blue-50" />}</div>
                  <span className="text-[9px] font-bold text-gray-300 uppercase shrink-0">{format(s.last_message_at, "HH:mm")}</span>
                </div>
                <p className={cn("text-xs truncate", s.unread_count > 0 ? "font-bold text-black" : "text-gray-400")}>{s.last_message}</p>
              </div>
            </div>
          ))
        )}
        {loadingSummaries && <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#00A2FF]" /></div>}
      </main>

      <AlertDialog open={!!chatToDelete} onOpenChange={(open) => !open && setChatToDelete(null)}>
        <AlertDialogContent className="rounded-3xl p-8 border-none shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-black text-center uppercase tracking-tight">Delete Conversation?</AlertDialogTitle>
            <AlertDialogDescription className="text-center text-[10px] font-bold uppercase tracking-widest text-gray-400">
              This will clear the chat history for you. It will reappear if you receive a new message.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-3 mt-4">
            <AlertDialogCancel className="h-12 rounded-xl font-black text-[10px] uppercase">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearChat} className="h-12 rounded-xl bg-red-500 font-black text-[10px] uppercase">Clear History</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-white select-none overflow-hidden">
      <header className="h-16 border-b flex items-center px-4 gap-4 bg-white z-[50] shrink-0">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full"><ChevronLeft className="w-6 h-6 text-black" /></Button>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Avatar className="w-10 h-10 border shrink-0">
            <AvatarImage src={partnerProfile?.photo_url} />
            <AvatarFallback>{partnerProfile?.name?.[0] || '?'}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col min-w-0">
            <p className="font-black text-sm truncate">{partnerProfile?.name || '...'}</p>
            {partnerProfile && <p className="text-[8px] font-bold text-[#00A2FF] uppercase tracking-widest">Active Now</p>}
          </div>
        </div>
      </header>
      
      <main className="flex-1 overflow-y-auto p-6 flex flex-col-reverse gap-4 bg-gray-50 no-scrollbar">
        {messages.map(m => (
          <div key={m.id} className={cn("max-w-[85%] p-4 rounded-2xl text-sm font-medium shadow-sm animate-in fade-in duration-200", 
            m.sender_id === currentUser?.id ? "bg-[#00A2FF] text-white self-end rounded-br-none" : "bg-white text-black self-start rounded-bl-none border"
          )}>
            {m.text}
          </div>
        ))}
        {loadingDetail && <div className="flex justify-center py-4"><Loader2 className="animate-spin text-gray-300" /></div>}
      </main>

      <footer className="p-4 border-t bg-white shrink-0 mb-[env(safe-area-inset-bottom,0px)]">
        <div className="flex items-center gap-2 max-w-5xl mx-auto w-full">
          <Dialog open={giftOpen} onOpenChange={setGiftOpen}>
            <DialogTrigger asChild>
               <Button variant="ghost" size="icon" className="h-12 w-12 rounded-full text-pink-500 bg-pink-50 shrink-0">
                 <Gift className="w-6 h-6" />
               </Button>
            </DialogTrigger>
            <DialogContent className="rounded-[2.5rem] p-8 border-none shadow-2xl">
               <DialogHeader className="items-center text-center space-y-2">
                  <div className="w-16 h-16 bg-pink-50 rounded-full flex items-center justify-center text-pink-500">
                    <Sparkles className="w-8 h-8" />
                  </div>
                  <DialogTitle className="text-xl font-black uppercase tracking-tight">Send a Gift</DialogTitle>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-relaxed">Impress {partnerProfile?.name || 'them'} with a virtual gesture.</p>
               </DialogHeader>
               <div className="grid grid-cols-3 gap-3 py-6">
                 {GIFTS.map(g => (
                   <button 
                    key={g.name} 
                    onClick={() => handleSendGift(g)}
                    className="flex flex-col items-center gap-2 p-4 bg-gray-50 rounded-2xl hover:bg-pink-50 hover:text-pink-600 transition-all border border-transparent active:scale-95"
                   >
                     <span className="text-3xl">{g.icon}</span>
                     <div className="flex flex-col items-center">
                        <span className="text-[8px] font-black uppercase tracking-widest">{g.name}</span>
                        <span className="text-[9px] font-bold text-yellow-600 flex items-center gap-0.5"><Coins className="w-2.5 h-2.5" />{g.cost}</span>
                     </div>
                   </button>
                 ))}
               </div>
            </DialogContent>
          </Dialog>

          <input 
            value={newMessage} 
            onChange={e => setNewMessage(e.target.value)} 
            onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
            className="flex-1 bg-gray-50 rounded-2xl px-4 py-3 outline-none font-medium text-sm border border-black/5" 
            placeholder="Type something..." 
          />
          <Button onClick={handleSendMessage} size="icon" disabled={!newMessage.trim()} className="rounded-full h-12 w-12 bg-[#00A2FF] text-white shrink-0 shadow-lg shadow-blue-100">
            <Send className="w-5 h-5" />
          </Button>
        </div>
      </footer>
    </div>
  );
}

export default function ChatsPage() { return <Suspense fallback={null}><ChatsContent /></Suspense> }
