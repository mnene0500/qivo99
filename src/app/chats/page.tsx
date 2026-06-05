"use client"

import { useEffect, useState, Suspense, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { Send, ChevronLeft, Gift, BadgeCheck, Loader2, MessageSquare, CheckCircle2, RotateCw, PlusCircle, Coins } from "lucide-react"
import { cn } from "@/lib/utils"
import { useUser } from "@/firebase/auth/use-user"
import { format } from "date-fns"
import { clearChatAction, sendMessageAction, markChatAsReadAction, sendGiftAction } from "@/app/actions/matchflow-actions"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useBalance } from "@/lib/providers/BalanceProvider"

interface ChatSummary {
  id: string; 
  partner_id: string; 
  partner_name: string; 
  partner_photo: string; 
  partner_is_verified?: boolean; 
  last_message: string; 
  last_message_at: number; 
  unread_count: number;
}

const GIFTS = [
  { name: "Rose", cost: 15, icon: "🌹" }, 
  { name: "Chocolate", cost: 20, icon: "🍫" }, 
  { name: "Coffee", cost: 30, icon: "☕" }, 
  { name: "Beer", cost: 40, icon: "🍺" }, 
  { name: "Heart", cost: 50, icon: "❤️" }, 
  { name: "Pizza", cost: 60, icon: "🍕" }, 
  { name: "Flowers", cost: 80, icon: "💐" }, 
  { name: "Teddy", cost: 100, icon: "🧸" }, 
  { name: "Perfume", cost: 150, icon: "🧴" }, 
  { name: "Crown", cost: 200, icon: "👑" }, 
  { name: "Ring", cost: 300, icon: "💍" }, 
  { name: "Diamond", cost: 500, icon: "💎" },
  { name: "Fireworks", cost: 750, icon: "🎆" }, 
  { name: "Rocket", cost: 1000, icon: "🚀" }, 
  { name: "Watch", cost: 1200, icon: "⌚" }, 
  { name: "Car", cost: 2000, icon: "🚗" }, 
  { name: "Plane", cost: 5000, icon: "✈️" }, 
  { name: "Supercar", cost: 7000, icon: "🏎️" }, 
  { name: "Yacht", cost: 10000, icon: "🛥️" }, 
  { name: "Castle", cost: 15000, icon: "🏰" }, 
  { name: "Private Jet", cost: 20000, icon: "🛩️" }, 
  { name: "Island", cost: 25000, icon: "🏝️" }, 
  { name: "Mega Yacht", cost: 30000, icon: "🛳️" }, 
  { name: "Galaxy", cost: 40000, icon: "🌌" }, 
  { name: "Universe", cost: 50000, icon: "🪐" }
];

function ChatsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { toast } = useToast()
  const { user: currentUser } = useUser()
  const { coins } = useBalance()
  const startWithId = searchParams.get("startWith")
  
  const [summaries, setSummaries] = useState<ChatSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [chatId, setChatId] = useState<string | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [partner, setPartner] = useState<any>(null)
  const [newMessage, setNewMessage] = useState("")
  const [chatToDelete, setChatToDelete] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [lastGiftSent, setLastGiftSent] = useState<typeof GIFTS[0] | null>(null)

  const fetchSummaries = useCallback(async () => {
    if (!currentUser?.id) return;
    
    const { data: chats } = await supabase
      .from('chats')
      .select('*')
      .contains('participant_ids', [currentUser.id])
      .order('last_message_at', { ascending: false });
      
    if (!chats) { setSummaries([]); setLoading(false); return; }

    const filtered = chats.filter(c => (c.last_message_at || 0) > ((c.cleared_at as any)?.[currentUser.id] || 0));
    
    const partnerIds = filtered.map(c => c.participant_ids.find((id: string) => id !== currentUser.id));
    const { data: profiles } = await supabase.from('users').select('uid, name, photo_url, is_verified').in('uid', partnerIds);
    const pMap = new Map(profiles?.map(p => [p.uid, p]));

    const enhanced = filtered.map(c => {
      const pId = c.participant_ids.find((id: string) => id !== currentUser.id);
      const p = pMap.get(pId);
      const seenAt = (c.last_seen_at as any)?.[currentUser.id] || 0;
      return {
        id: c.id, 
        partner_id: pId!, 
        partner_name: p?.name || 'User', 
        partner_photo: p?.photo_url || '', 
        partner_is_verified: p?.is_verified,
        last_message: c.last_message || "", 
        last_message_at: c.last_message_at || 0,
        unread_count: (c.last_message_at > seenAt && c.last_sender_id !== currentUser.id) ? 1 : 0
      };
    });
    setSummaries(enhanced);
    setLoading(false);
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id) return;
    fetchSummaries();
    
    const channel = supabase.channel('chats-sync-global')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chats' }, () => fetchSummaries())
      .subscribe();
      
    return () => { supabase.removeChannel(channel); };
  }, [currentUser?.id, fetchSummaries]);

  useEffect(() => {
    if (!startWithId || !currentUser?.id) return;
    
    const cid = `direct_${[currentUser.id, startWithId].sort()[0]}_${[currentUser.id, startWithId].sort()[1]}`;
    setChatId(cid);
    
    supabase.from('users').select('*').eq('uid', startWithId).single().then(({ data }) => setPartner(data));
    
    const loadMessages = async () => {
      const { data: chatData } = await supabase.from('chats').select('cleared_at').eq('id', cid).maybeSingle();
      const clearedAt = (chatData?.cleared_at as any)?.[currentUser.id] || 0;
      
      const { data: msgs } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', cid)
        .gt('timestamp', clearedAt)
        .order('timestamp', { ascending: false })
        .limit(50);
        
      setMessages(msgs || []);
    };

    loadMessages();
    markChatAsReadAction(currentUser.id, cid);

    const channel = supabase.channel(`msgs-${cid}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'messages', 
        filter: `chat_id=eq.${cid}` 
      }, (payload) => {
        setMessages(prev => {
          if (prev.some(m => m.id === payload.new.id)) return prev;
          if (payload.new.sender_id === currentUser?.id) {
            const optIdx = prev.findIndex(m => 
              m.sender_id === payload.new.sender_id && 
              m.text === payload.new.text && 
              typeof m.id === 'number' && m.id > 1000000000
            );
            if (optIdx !== -1) {
              const reconciled = [...prev];
              reconciled[optIdx] = payload.new;
              return reconciled;
            }
          }
          return [payload.new, ...prev];
        });
        markChatAsReadAction(currentUser.id, cid);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [startWithId, currentUser?.id]);

  const handleSend = async () => {
    if (!newMessage.trim() || !chatId || !currentUser?.id || !startWithId || isSending) return;
    setIsSending(true);
    const text = newMessage;
    setNewMessage("");
    const optimisticMsg = { id: Date.now() + Math.random(), chat_id: chatId, sender_id: currentUser.id, text, timestamp: Date.now(), isPending: true };
    setMessages(prev => [optimisticMsg, ...prev]);
    const res = await sendMessageAction({ chatId, senderId: currentUser.id, recipientId: startWithId, text });
    if (!res.success) {
      toast({ variant: "destructive", title: "Message Failed", description: res.error === 'insufficient_funds' ? "You need more coins to message." : "System error." });
      setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id));
    }
    setIsSending(false);
  };

  const handleSendGift = async (g: typeof GIFTS[0]) => {
    if (!currentUser?.id || !startWithId || isSending) return;
    if (coins < g.cost) {
      toast({ variant: "destructive", title: "Insufficient Coins" });
      return;
    }
    setIsSending(true);
    try {
      const res = await sendGiftAction(currentUser.id, startWithId, g.cost, g.name);
      if (res.success) {
        setLastGiftSent(g);
        const giftMsg = { id: Date.now() + Math.random(), chat_id: chatId!, sender_id: currentUser.id, text: `[Gift: ${g.name}]`, timestamp: Date.now(), is_gift: true };
        setMessages(prev => [giftMsg, ...prev]);
      } else {
        toast({ variant: "destructive", title: "Gift failed" });
      }
    } finally {
      setIsSending(false);
    }
  }

  const handleClear = async () => {
    if (!chatToDelete || !currentUser?.id) return;
    setSummaries(prev => prev.filter(s => s.id !== chatToDelete));
    const res = await clearChatAction(currentUser.id, chatToDelete);
    if (!res.success) fetchSummaries();
    setChatToDelete(null);
  };

  if (!startWithId) return (
    <div className="flex-1 bg-white min-h-screen relative select-none">
      <header className="px-6 h-16 flex items-center border-b sticky top-0 bg-white/90 backdrop-blur-md z-50">
        <h1 className="text-2xl font-black text-[#00A2FF] tracking-tight">Chats</h1>
      </header>
      <main className="flex flex-col pb-24">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#00A2FF]" /></div>
        ) : summaries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-40 opacity-40 space-y-4">
            <MessageSquare className="w-12 h-12 text-gray-200" />
            <p className="uppercase font-black text-[10px] tracking-widest">No conversations yet</p>
          </div>
        ) : (
          summaries.map(s => (
            <div key={s.id} onContextMenu={(e) => { e.preventDefault(); setChatToDelete(s.id); }} onClick={() => router.push(`/chats?startWith=${s.partner_id}`)} className="p-4 flex items-center gap-4 active:bg-gray-50 border-b border-gray-50 transition-colors cursor-pointer">
              <div className="relative">
                <Avatar className="w-14 h-14 border"><AvatarImage src={s.partner_photo} /><AvatarFallback>{s.partner_name[0]}</AvatarFallback></Avatar>
                {s.unread_count > 0 && <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-black w-6 h-6 rounded-full flex items-center justify-center border-2 border-white shadow-sm">{s.unread_count}</div>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between mb-1">
                  <div className="flex items-center gap-1.5 min-w-0"><p className="text-sm font-black truncate">{s.partner_name}</p>{s.partner_is_verified && <BadgeCheck className="w-3.5 h-3.5 text-[#00A2FF] fill-blue-50" />}</div>
                  <span className="text-[9px] font-bold text-gray-300 uppercase shrink-0">{s.last_message_at ? format(s.last_message_at, "HH:mm") : ""}</span>
                </div>
                <p className="text-xs truncate text-gray-400 font-medium">{s.last_message}</p>
              </div>
            </div>
          ))
        )}
      </main>
      <AlertDialog open={!!chatToDelete} onOpenChange={() => setChatToDelete(null)}>
        <AlertDialogContent className="rounded-[2rem] p-8 max-w-[85vw]">
          <AlertDialogHeader><AlertDialogTitle className="font-black text-center uppercase tracking-tight">Delete Chat?</AlertDialogTitle></AlertDialogHeader>
          <AlertDialogFooter className="gap-3 mt-4">
            <AlertDialogCancel className="h-12 rounded-xl font-black text-[10px] uppercase tracking-widest border-none bg-gray-50">Keep</AlertDialogCancel>
            <AlertDialogAction onClick={handleClear} className="h-12 rounded-xl bg-red-500 font-black text-[10px] uppercase tracking-widest border-none text-white shadow-lg shadow-red-100">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden select-none">
      <header className="h-16 border-b flex items-center px-4 gap-4 bg-white z-50 shrink-0">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full"><ChevronLeft className="w-6 h-6 text-black" /></Button>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Avatar className="w-10 h-10 border"><AvatarImage src={partner?.photo_url} /><AvatarFallback>{partner?.name?.[0]}</AvatarFallback></Avatar>
          <div className="min-w-0">
            <p className="font-black text-sm truncate text-black">{partner?.name || 'Loading...'}</p>
            <p className="text-[8px] font-bold text-[#00A2FF] uppercase tracking-widest">Active Now</p>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6 flex flex-col-reverse gap-4 bg-gray-50 no-scrollbar pb-10">
        {messages.map((m, idx) => {
          const isGiftMsg = m.is_gift || m.text?.startsWith('[Gift:');
          const giftName = m.text?.match(/\[Gift: (.*)\]/)?.[1];
          const giftEmoji = GIFTS.find(g => g.name === giftName)?.icon || '🎁';
          const isLatestMsg = idx === 0;

          return (
            <div key={m.id} className={cn("max-w-[85%] p-4 rounded-2xl text-sm font-medium shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300 flex flex-col gap-2", m.sender_id === currentUser?.id ? "bg-[#00A2FF] text-white self-end rounded-br-none" : "bg-white text-black self-start rounded-bl-none border border-black/5")}>
              <div className="flex items-center gap-2">{isGiftMsg && <span className="text-xl">{giftEmoji}</span>}<span className="break-words">{m.text}</span></div>
              {isGiftMsg && m.sender_id === currentUser?.id && isLatestMsg && (
                <Button onClick={() => { const g = GIFTS.find(gf => gf.name === giftName); if (g) handleSendGift(g); }} disabled={isSending} variant="ghost" className="h-8 rounded-xl bg-white/20 hover:bg-white/30 text-white text-[9px] font-black uppercase tracking-widest border border-white/20 self-start mt-1">
                  {isSending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Send One More"}
                </Button>
              )}
            </div>
          )
        })}
      </main>

      <footer className="p-4 border-t bg-white shrink-0 pb-[calc(env(safe-area-inset-bottom,20px)+8px)]">
        <div className="flex items-center gap-2 max-w-5xl mx-auto w-full mb-2">
          <Sheet onOpenChange={(open) => !open && setLastGiftSent(null)}>
            <SheetTrigger asChild>
              <Button size="icon" variant="ghost" className="rounded-full text-pink-500 hover:bg-pink-50 transition-colors shrink-0"><Gift className="w-6 h-6" /></Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-[3rem] p-6 border-none shadow-2xl bg-black text-white h-[70vh] flex flex-col overflow-hidden">
               <SheetHeader className="shrink-0 mb-6">
                 <div className="flex items-center justify-between px-4">
                    <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-full border border-white/5"><Coins className="w-3.5 h-3.5 text-yellow-500 fill-current" /><span className="text-xs font-black">{coins}</span></div>
                    <SheetTitle className="text-center font-black uppercase text-[10px] tracking-[0.2em] text-gray-400">Gifts</SheetTitle>
                    <Button onClick={() => router.push('/recharge')} variant="ghost" size="sm" className="h-8 rounded-full bg-[#00A2FF] text-white text-[9px] font-black uppercase px-4 shadow-lg shadow-blue-500/20"><PlusCircle className="w-3 h-3 mr-1" /> Top Up</Button>
                 </div>
               </SheetHeader>
               <div className="flex-1 overflow-y-auto no-scrollbar pb-10">
                 {lastGiftSent ? (
                   <div className="flex flex-col items-center justify-center p-8 space-y-6 animate-in zoom-in-95">
                      <div className="w-24 h-24 bg-white/10 rounded-full flex items-center justify-center text-5xl shadow-xl border border-white/5">{lastGiftSent.icon}</div>
                      <div className="text-center"><p className="text-lg font-black text-white uppercase tracking-tight">Gift Sent!</p></div>
                      <Button onClick={() => handleSendGift(lastGiftSent)} disabled={isSending} className="w-full h-14 rounded-full bg-pink-500 text-white font-black uppercase tracking-widest text-[10px] shadow-lg active:scale-95">{isSending ? <Loader2 className="animate-spin" /> : <div className="flex items-center gap-2"><RotateCw className="w-4 h-4" /> Send One More</div>}</Button>
                      <Button variant="ghost" onClick={() => setLastGiftSent(null)} className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Send different</Button>
                   </div>
                 ) : (
                   <div className="grid grid-cols-3 gap-3">
                      {GIFTS.map(g => (
                        <button key={g.name} onClick={() => handleSendGift(g)} className="flex flex-col items-center justify-center p-4 bg-white/5 rounded-2xl hover:bg-white/10 transition-all border border-transparent hover:border-white/10 active:scale-95 group">
                          <span className="text-3xl mb-2 group-hover:scale-110 transition-transform">{g.icon}</span>
                          <span className="text-[8px] font-black uppercase text-gray-400 truncate w-full text-center">{g.name}</span>
                          <div className="flex items-center gap-1 mt-1"><span className="text-[10px] font-bold text-yellow-500">{g.cost}</span><Coins className="w-2.5 h-2.5 text-yellow-500 fill-current" /></div>
                        </button>
                      ))}
                   </div>
                 )}
               </div>
            </SheetContent>
          </Sheet>
          <input value={newMessage} onChange={e => setNewMessage(e.target.value)} onKeyDown={e => e.key === 'Enter' && !isSending && handleSend()} className="flex-1 bg-gray-50 rounded-2xl px-4 py-3 outline-none font-medium text-sm border border-black/5 focus:bg-white transition-all" placeholder="Type message..." />
          <Button onClick={handleSend} size="icon" disabled={!newMessage.trim() || isSending} className="rounded-full h-12 w-12 bg-[#00A2FF] text-white shrink-0 shadow-lg shadow-blue-100 active:scale-90 transition-all">{isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}</Button>
        </div>
      </footer>
    </div>
  );
}

export default function ChatsPage() { 
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center min-h-screen bg-white"><Loader2 className="w-8 h-8 animate-spin text-[#00A2FF]" /></div>}>
      <ChatsContent />
    </Suspense> 
  );
}
