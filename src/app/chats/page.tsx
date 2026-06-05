
"use client"

import { useEffect, useState, Suspense, useCallback, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { supabase, base64ToBlob, uploadPostPhoto } from "@/lib/supabase"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { Send, ChevronLeft, Gift, BadgeCheck, Loader2, MessageSquare, PlusCircle, Coins, Phone, Video, Check, CheckCheck, Image as ImageIcon, X, ShieldAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { useUser } from "@/firebase/auth/use-user"
import { format } from "date-fns"
import { clearChatAction, sendMessageAction, markChatAsReadAction, sendGiftAction } from "@/app/actions/matchflow-actions"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useBalance } from "@/lib/providers/BalanceProvider"
import { startCallAction } from "@/app/actions/call-actions"
import Image from "next/image"

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
  { name: "Rose", cost: 15, icon: "🌹" }, { name: "Chocolate", cost: 20, icon: "🍫" }, { name: "Coffee", cost: 30, icon: "☕" }, { name: "Beer", cost: 40, icon: "🍺" }, { name: "Heart", cost: 50, icon: "❤️" }, { name: "Pizza", cost: 60, icon: "🍕" }, { name: "Flowers", cost: 80, icon: "💐" }, { name: "Teddy", cost: 100, icon: "🧸" }, { name: "Perfume", cost: 150, icon: "🧴" }, { name: "Crown", cost: 200, icon: "👑" }, { name: "Ring", cost: 300, icon: "💍" }, { name: "Diamond", cost: 500, icon: "💎" }, { name: "Fireworks", cost: 750, icon: "🎆" }, { name: "Rocket", cost: 1000, icon: "🚀" }, { name: "Watch", cost: 1200, icon: "⌚" }, { name: "Car", cost: 2000, icon: "🚗" }, { name: "Plane", cost: 5000, icon: "✈️" }, { name: "Supercar", cost: 7000, icon: "🏎️" }, { name: "Yacht", cost: 10000, icon: "🛥️" }, { name: "Castle", cost: 15000, icon: "🏰" }, { name: "Private Jet", cost: 20000, icon: "🛩️" }, { name: "Island", cost: 25000, icon: "🏝️" }, { name: "Mega Yacht", cost: 30000, icon: "🛳️" }, { name: "Galaxy", cost: 40000, icon: "🌌" }, { name: "Universe", cost: 50000, icon: "🪐" }
];

const MSG_PAGE_SIZE = 25;

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
  const [me, setMe] = useState<any>(null)
  const [newMessage, setNewMessage] = useState("")
  const [chatToDelete, setChatToDelete] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [lastGiftSent, setLastGiftSent] = useState<typeof GIFTS[0] | null>(null)
  const [chatInfo, setChatInfo] = useState<any>(null)
  const [hasMoreMsgs, setHasMoreMsgs] = useState(true)
  const [loadingOldMsgs, setLoadingMoreMsgs] = useState(false)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLElement>(null)

  const isBlocked = partner?.blocked_by?.includes(currentUser?.id) || partner?.blocking?.includes(currentUser?.id);

  const fetchSummaries = useCallback(async () => {
    if (!currentUser?.id) return;
    
    // Select ONLY necessary summary fields
    const { data: chats } = await supabase
      .from('chats')
      .select('id, participant_ids, last_message, last_message_at, cleared_at, last_seen_at, last_sender_id')
      .contains('participant_ids', [currentUser.id])
      .order('last_message_at', { ascending: false })
      .limit(40);

    if (!chats) { setSummaries([]); setLoading(false); return; }
    
    const filtered = chats.filter(c => (c.last_message_at || 0) > ((c.cleared_at as any)?.[currentUser.id] || 0));
    const partnerIds = filtered.map(c => c.participant_ids.find((id: string) => id !== currentUser.id));
    
    // Batch fetch partner profiles with explicit columns
    const { data: profiles } = await supabase
      .from('users')
      .select('uid, name, photo_url, is_verified, blocking, blocked_by')
      .in('uid', partnerIds);

    const pMap = new Map(profiles?.filter(p => !p.blocking?.includes(currentUser.id) && !p.blocked_by?.includes(currentUser.id)).map(p => [p.uid, p]));
    
    const enhanced = filtered.map(c => {
      const pId = c.participant_ids.find((id: string) => id !== currentUser.id);
      const p = pMap.get(pId);
      if (!p) return null; // Skip blocked summaries

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
    }).filter(Boolean) as ChatSummary[];

    setSummaries(enhanced); setLoading(false);
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id) return;
    supabase.from('users').select('*').eq('uid', currentUser.id).single().then(({ data }) => setMe(data))
    fetchSummaries();
    
    const channel = supabase.channel('chats-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chats' }, () => fetchSummaries())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentUser?.id, fetchSummaries]);

  const loadOldMessages = async () => {
    if (!chatId || !currentUser?.id || loadingOldMsgs || !hasMoreMsgs) return;
    setLoadingMoreMsgs(true);
    const oldestTs = messages.length > 0 ? messages[messages.length - 1].timestamp : Date.now();
    const clearedAt = (chatInfo?.cleared_at as any)?.[currentUser.id] || 0;
    
    const { data: msgs } = await supabase.from('messages')
      .select('id, chat_id, sender_id, text, timestamp, is_gift, image_url')
      .eq('chat_id', chatId)
      .gt('timestamp', clearedAt)
      .lt('timestamp', oldestTs)
      .order('timestamp', { ascending: false })
      .limit(MSG_PAGE_SIZE);

    if (msgs && msgs.length > 0) {
      setMessages(prev => [...prev, ...msgs]);
      setHasMoreMsgs(msgs.length === MSG_PAGE_SIZE);
    } else {
      setHasMoreMsgs(false);
    }
    setLoadingMoreMsgs(false);
  };

  useEffect(() => {
    if (!startWithId || !currentUser?.id) return;
    const cid = `direct_${[currentUser.id, startWithId].sort()[0]}_${[currentUser.id, startWithId].sort()[1]}`;
    setChatId(cid);
    
    supabase.from('users').select('*').eq('uid', startWithId).single().then(({ data }) => setPartner(data));
    
    const loadInitialMessages = async () => {
      const { data: chatData } = await supabase.from('chats').select('id, cleared_at, last_seen_at').eq('id', cid).maybeSingle();
      setChatInfo(chatData);
      const clearedAt = (chatData?.cleared_at as any)?.[currentUser.id] || 0;
      
      const { data: msgs } = await supabase.from('messages')
        .select('id, chat_id, sender_id, text, timestamp, is_gift, image_url')
        .eq('chat_id', cid)
        .gt('timestamp', clearedAt)
        .order('timestamp', { ascending: false })
        .limit(MSG_PAGE_SIZE);
        
      setMessages(msgs || []);
      setHasMoreMsgs((msgs?.length || 0) === MSG_PAGE_SIZE);
    };
    loadInitialMessages(); markChatAsReadAction(currentUser.id, cid);
    
    const channel = supabase.channel(`msgs-${cid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${cid}` }, (payload) => {
        setMessages(prev => {
          const isDuplicate = prev.some(m => m.timestamp === payload.new.timestamp && m.sender_id === payload.new.sender_id);
          if (isDuplicate) return prev;
          return [payload.new, ...prev];
        });
        markChatAsReadAction(currentUser.id, cid);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chats', filter: `id=eq.${cid}` }, (payload) => {
        setChatInfo(payload.new);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [startWithId, currentUser?.id]);

  const handleSend = async () => {
    if (!chatId || !currentUser?.id || !startWithId || isSending || isBlocked) return;
    const text = newMessage.trim();
    if (!text && !selectedImage) return;

    setIsSending(true);
    let finalImageUrl = undefined;

    try {
      if (selectedImage) {
        if (coins < 30 && me?.gender === 'male' && !me?.is_admin && !me?.is_coin_seller) {
           toast({ variant: "destructive", title: "Insufficient Coins", description: "Sharing images costs 30 coins." });
           setIsSending(false);
           return;
        }
        const { blob } = base64ToBlob(selectedImage);
        finalImageUrl = await uploadPostPhoto(blob, currentUser.id, 'photos');
      }

      const res = await sendMessageAction({ chatId, senderId: currentUser.id, recipientId: startWithId, text, imageUrl: finalImageUrl });
      if (!res.success) {
        toast({ variant: "destructive", title: "Failed", description: res.error === 'insufficient_funds' ? "You need more coins." : "Network Error." });
      } else {
        setNewMessage("");
        setSelectedImage(null);
      }
    } catch (e) {
      toast({ variant: "destructive", title: "Upload Failed" });
    } finally {
      setIsSending(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setSelectedImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  }

  const handleCall = async (type: 'video' | 'voice') => {
    if (!currentUser?.id || !startWithId || !chatId || isBlocked) return;
    setIsSending(true);
    const callRes = await startCallAction(chatId, currentUser.id, startWithId, type);
    if (callRes.success) {
      router.push(`/call/${chatId}?type=${type}&partnerId=${startWithId}&callId=${callRes.callId}`);
    } else {
      toast({ variant: "destructive", title: "Call Failed", description: callRes.error });
    }
    setIsSending(false);
  };

  const handleSendGift = async (g: typeof GIFTS[0]) => {
    if (!currentUser?.id || !startWithId || isSending || isBlocked) return;
    if (coins < g.cost) { toast({ variant: "destructive", title: "Insufficient Coins" }); return; }
    setIsSending(true);
    try {
      const res = await sendGiftAction(currentUser.id, startWithId, g.cost, g.name);
      if (res.success) setLastGiftSent(g);
    } finally { setIsSending(false); }
  }

  if (!startWithId) return (
    <div className="flex-1 bg-white min-h-screen relative select-none">
      <header className="px-6 h-16 flex items-center border-b sticky top-0 bg-white/90 backdrop-blur-md z-50"><h1 className="text-2xl font-black text-[#00A2FF] tracking-tight">Chats</h1></header>
      <main className="flex flex-col pb-24">
        {loading ? (<div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#00A2FF]" /></div>) : summaries.length === 0 ? (<div className="flex flex-col items-center justify-center py-40 opacity-40 space-y-4"><MessageSquare className="w-12 h-12 text-gray-200" /><p className="uppercase font-black text-[10px] tracking-widest">No conversations</p></div>) : (
          summaries.map(s => (<div key={s.id} onContextMenu={(e) => { e.preventDefault(); setChatToDelete(s.id); }} onClick={() => router.push(`/chats?startWith=${s.partner_id}`)} className="p-4 flex items-center gap-4 active:bg-gray-50 border-b border-gray-50 transition-colors cursor-pointer"><div className="relative"><Avatar className="w-14 h-14 border"><AvatarImage src={s.partner_photo} /><AvatarFallback>{s.partner_name[0]}</AvatarFallback></Avatar>{s.unread_count > 0 && <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-black w-6 h-6 rounded-full flex items-center justify-center border-2 border-white shadow-sm">{s.unread_count}</div>}</div><div className="flex-1 min-w-0"><div className="flex justify-between mb-1"><div className="flex items-center gap-1.5 min-w-0"><p className="text-sm font-black truncate">{s.partner_name}</p>{s.partner_is_verified && <BadgeCheck className="w-3.5 h-3.5 text-[#00A2FF] fill-blue-50" />}</div><span className="text-[9px] font-bold text-gray-300 uppercase shrink-0">{s.last_message_at ? format(s.last_message_at, "HH:mm") : ""}</span></div><p className="text-xs truncate text-gray-400 font-medium">{s.last_message}</p></div></div>))
        )}
      </main>
      <AlertDialog open={!!chatToDelete} onOpenChange={() => setChatToDelete(null)}><AlertDialogContent className="rounded-[2rem] p-8 max-w-[85vw]"><AlertDialogHeader><AlertDialogTitle className="font-black text-center uppercase tracking-tight">Delete Chat?</AlertDialogTitle></AlertDialogHeader><AlertDialogFooter className="gap-3 mt-4"><AlertDialogCancel className="h-12 rounded-xl font-black text-[10px] uppercase tracking-widest border-none bg-gray-50">Keep</AlertDialogCancel><AlertDialogAction onClick={() => { if (chatToDelete) { clearChatAction(currentUser!.id, chatToDelete); setSummaries(prev => prev.filter(s => s.id !== chatToDelete)); setChatToDelete(null); } }} className="h-12 rounded-xl bg-red-500 font-black text-[10px] uppercase tracking-widest border-none text-white shadow-lg shadow-red-100">Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden select-none relative">
      <header className="h-16 border-b flex items-center px-4 gap-4 bg-white z-50 shrink-0">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full"><ChevronLeft className="w-6 h-6 text-black" /></Button>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Avatar className="w-10 h-10 border"><AvatarImage src={partner?.photo_url} /><AvatarFallback>{partner?.name?.[0]}</AvatarFallback></Avatar>
          <div className="min-w-0"><p className="font-black text-sm truncate text-black">{partner?.name || 'Loading...'}</p><p className="text-[8px] font-bold text-green-500 uppercase tracking-widest">Online</p></div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => handleCall('voice')} className="rounded-full text-blue-500"><Phone className="w-5 h-5" /></Button>
          <Button variant="ghost" size="icon" onClick={() => handleCall('video')} className="rounded-full text-blue-500"><Video className="w-5 h-5" /></Button>
        </div>
      </header>

      <main ref={scrollRef} className="flex-1 overflow-y-auto p-6 flex flex-col-reverse gap-4 bg-gray-50 no-scrollbar pb-10">
        {messages.map((m, idx) => {
          const isGiftMsg = m.is_gift || m.text?.startsWith('[Gift:');
          const giftName = m.text?.match(/\[Gift: (.*)\]/)?.[1];
          const giftEmoji = GIFTS.find(g => g.name === giftName)?.icon || '🎁';
          const isMe = m.sender_id === currentUser?.id;
          const partnerSeenAt = (chatInfo?.last_seen_at as any)?.[startWithId!] || 0;
          const isSeen = m.timestamp <= partnerSeenAt;

          return (
            <div key={m.id} className={cn("max-w-[85%] flex flex-col gap-1", isMe ? "self-end items-end" : "self-start items-start")}>
              <div className={cn("p-4 rounded-2xl text-sm font-medium shadow-sm flex flex-col gap-2", isMe ? "bg-[#00A2FF] text-white rounded-br-none" : "bg-white text-black rounded-bl-none border border-black/5")}>
                {m.image_url && (
                  <div className="relative aspect-square w-full min-w-[200px] rounded-xl overflow-hidden mb-2 cursor-pointer active:scale-95 transition-transform" onClick={() => setPreviewImage(m.image_url)}>
                    <Image src={m.image_url} alt="Shared Photo" fill className="object-cover" sizes="250px" />
                  </div>
                )}
                <div className="flex items-center gap-2">{isGiftMsg && <span className="text-xl">{giftEmoji}</span>}<span className="break-words">{m.text}</span></div>
              </div>
              {isMe && me?.has_read_receipts && (
                <div className="flex items-center gap-1 px-1">
                   {isSeen ? <CheckCheck className="w-3 h-3 text-blue-500" /> : <Check className="w-3 h-3 text-gray-300" />}
                   <span className="text-[8px] font-black uppercase text-gray-400 tracking-widest">{isSeen ? 'Seen' : 'Sent'}</span>
                </div>
              )}
            </div>
          )
        })}
        {hasMoreMsgs && (
          <Button variant="ghost" onClick={loadOldMessages} disabled={loadingOldMsgs} className="text-[9px] font-black text-gray-400 uppercase tracking-widest self-center py-6">
            {loadingOldMsgs ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : null}
            Load older messages
          </Button>
        )}
      </main>

      <footer className="p-4 border-t bg-white shrink-0 pb-[calc(env(safe-area-inset-bottom,20px)+8px)]">
        <div className="max-w-5xl mx-auto w-full space-y-4">
          {selectedImage && (
            <div className="relative w-20 h-20 rounded-2xl overflow-hidden border-2 border-[#00A2FF] animate-in zoom-in-95">
              <Image src={selectedImage} alt="Preview" fill className="object-cover" />
              <button onClick={() => setSelectedImage(null)} className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-1"><X className="w-3 h-3" /></button>
            </div>
          )}
          
          <div className="flex items-center gap-2">
            <input value={newMessage} onChange={e => setNewMessage(e.target.value)} onKeyDown={e => e.key === 'Enter' && !isSending && handleSend()} className="flex-1 bg-gray-50 rounded-2xl px-4 py-3 outline-none font-medium text-sm border border-black/5" placeholder="Type message..." />
            <Button onClick={handleSend} size="icon" disabled={(!newMessage.trim() && !selectedImage) || isSending} className="rounded-full h-12 w-12 bg-[#00A2FF] text-white shrink-0 shadow-lg active:scale-90 transition-all">
              {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </Button>
          </div>

          <div className="flex items-center gap-6 px-1">
            <Sheet onOpenChange={(open) => !open && setLastGiftSent(null)}>
              <SheetTrigger asChild>
                <button className="flex items-center gap-2 text-pink-500 active:scale-95 transition-transform"><Gift className="w-6 h-6" /><span className="text-[10px] font-black uppercase tracking-widest">Send Gift</span></button>
              </SheetTrigger>
              <SheetContent side="bottom" className="rounded-t-[3rem] p-6 border-none bg-black text-white h-[70vh] flex flex-col overflow-hidden">
                <SheetHeader className="shrink-0 mb-6"><div className="flex items-center justify-between px-4"><div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-full border border-white/5"><Coins className="w-3.5 h-3.5 text-yellow-500 fill-current" /><span className="text-xs font-black">{coins}</span></div><SheetTitle className="text-center font-black uppercase text-[10px] tracking-[0.2em] text-gray-400">Gifts</SheetTitle><Button onClick={() => router.push('/recharge')} variant="ghost" size="sm" className="h-8 rounded-full bg-[#00A2FF] text-white text-[9px] font-black uppercase px-4 shadow-lg shadow-blue-500/20"><PlusCircle className="w-3 h-3 mr-1" /> Top Up</Button></div></SheetHeader>
                <div className="flex-1 overflow-y-auto no-scrollbar pb-10">
                  {lastGiftSent ? (
                    <div className="flex flex-col items-center justify-center p-8 space-y-6 animate-in zoom-in-95"><div className="w-24 h-24 bg-white/10 rounded-full flex items-center justify-center text-5xl shadow-xl border border-white/5">{lastGiftSent.icon}</div><div className="text-center"><p className="text-lg font-black text-white uppercase tracking-tight">Gift Sent!</p></div><Button onClick={() => handleSendGift(lastGiftSent)} disabled={isSending} className="w-full h-14 rounded-full bg-pink-500 text-white font-black uppercase tracking-widest text-[10px] shadow-lg active:scale-95">{isSending ? <Loader2 className="animate-spin" /> : "Send One More"}</Button><Button variant="ghost" onClick={() => setLastGiftSent(null)} className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Send different</Button></div>
                  ) : (
                    <div className="grid grid-cols-3 gap-3">{GIFTS.map(g => (<button key={g.name} onClick={() => handleSendGift(g)} className="flex flex-col items-center justify-center p-4 bg-white/5 rounded-2xl hover:bg-white/10 transition-all border border-transparent hover:border-white/10 active:scale-95 group"><span className="text-3xl mb-2 group-hover:scale-110 transition-transform">{g.icon}</span><span className="text-[8px] font-black uppercase text-gray-400 truncate w-full text-center">{g.name}</span><div className="flex items-center gap-1 mt-1"><span className="text-[10px] font-bold text-yellow-500">{g.cost}</span><Coins className="w-2.5 h-2.5 text-yellow-500 fill-current" /></div></button>))}</div>
                  )}
                </div>
              </SheetContent>
            </Sheet>

            <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 text-blue-500 active:scale-95 transition-transform"><ImageIcon className="w-6 h-6" /><span className="text-[10px] font-black uppercase tracking-widest">Share Photo</span></button>
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
          </div>
        </div>
      </footer>

      {isBlocked && (
        <div className="absolute inset-0 z-[150] bg-white/80 backdrop-blur-md flex flex-col items-center justify-center p-10 text-center animate-in fade-in">
           <div className="w-20 h-20 bg-red-50 rounded-[2.5rem] flex items-center justify-center mb-6 text-red-500">
             <ShieldAlert className="w-10 h-10" />
           </div>
           <h3 className="text-xl font-black text-black tracking-tight uppercase">Interaction Blocked</h3>
           <p className="text-xs font-bold text-gray-400 mt-2 leading-relaxed max-w-[240px]">This user is currently blocked. You cannot read messages or interact further.</p>
           <Button onClick={() => router.back()} className="mt-8 rounded-full h-14 px-10 bg-black text-white font-black uppercase tracking-widest text-[10px]">Go Back</Button>
        </div>
      )}

      {previewImage && (
        <div className="fixed inset-0 z-[200] bg-black/95 flex flex-col items-center justify-center animate-in fade-in" onClick={() => setPreviewImage(null)}>
          <button className="absolute top-12 right-6 w-10 h-10 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/20"><X className="w-6 h-6" /></button>
          <div className="relative w-full h-[80vh]"><Image src={previewImage} alt="Full" fill className="object-contain" sizes="100vw" /></div>
        </div>
      )}
    </div>
  );
}

export default function ChatsPage() { 
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center min-h-screen bg-white"><Loader2 className="w-8 h-8 animate-spin text-[#00A2FF]" /></div>}><ChatsContent /></Suspense> 
  );
}
