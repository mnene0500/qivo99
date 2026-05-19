
"use client"

import { useEffect, useState, Suspense, useMemo, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { doc } from "firebase/firestore"
import { ref, onValue, push, set, update, increment as rtdbIncrement, limitToLast, query as rtdbQuery, get, off } from "firebase/database"
import { useFirestore, useUser, useDoc, useDatabase } from "@/firebase"
import { BottomNav } from "@/components/layout/BottomNav"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { 
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { 
  Send, 
  ChevronLeft, 
  ShoppingBag, 
  Gift as GiftIcon,
  Coins,
  Loader2,
  Ban,
  BadgeCheck,
  Video,
  Phone
} from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { useUserPresence } from "@/hooks/use-presence"

interface Message {
  id: string
  text: string
  senderId: string
  timestamp: number
}

interface ChatSummary {
  id: string
  partnerId: string
  partnerName: string
  partnerPhoto: string
  lastMessage: string
  lastMessageAt: number
  unreadCount: number
  deletedAt?: number
}

interface UserProfile {
  uid: string
  name: string
  photoURL: string
  gender?: string
  blocking?: string[]
  blockedBy?: string[]
  isAdmin?: boolean
  isVerified?: boolean
}

const GIFTS = [
  { id: 'heart', name: 'Heart', price: 150, icon: '❤️' },
  { id: 'rose', name: 'Rose', price: 250, icon: '🌹' },
  { id: 'butterfly', name: 'Butterfly', price: 500, icon: '🦋' },
  { id: 'perfume', name: 'Perfume', price: 1000, icon: '🧴' },
  { id: 'teddy', name: 'Teddy', price: 2000, icon: '🧸' },
  { id: 'motor', name: 'Harley', price: 3000, icon: '🏍️' },
  { id: 'car', name: 'Sports Car', price: 5000, icon: '🏎️' },
  { id: 'diamond', name: 'Diamond', price: 25000, icon: '💎' },
]

function ChatListItem({ summary, onClick, onDelete }: { summary: ChatSummary, onClick: () => void, onDelete: () => void }) {
  const presence = useUserPresence(summary.partnerId)
  const lastAt = new Date(summary.lastMessageAt || Date.now())
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const handleTouchStart = () => {
    timerRef.current = setTimeout(() => {
      onDelete()
    }, 800)
  }

  const handleTouchEnd = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }

  return (
    <div 
      className="flex items-center gap-3 p-4 hover:bg-gray-50 cursor-pointer transition-all active:scale-[0.98] border-b border-gray-50 select-none min-h-[80px]"
      onClick={onClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onContextMenu={(e) => {
        e.preventDefault()
        onDelete()
      }}
    >
      <div className="relative">
        <Avatar className="w-14 h-14 rounded-full border-none shadow-sm">
          <AvatarImage src={summary.partnerPhoto || ""} className="object-cover" />
          <AvatarFallback className="bg-[#00A2FF] text-white font-semibold text-sm">{summary.partnerName?.[0] || '?'}</AvatarFallback>
        </Avatar>
        {presence?.state === 'online' && <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-white rounded-full" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-center mb-0.5">
          <h4 className="font-semibold text-sm text-black truncate max-w-[70%]">{summary.partnerName || "Unknown"}</h4>
          <span className="text-[10px] text-gray-400 font-medium">{format(lastAt, "HH:mm")}</span>
        </div>
        <div className="flex justify-between items-center">
          <p className={cn("text-xs truncate flex-1 pr-2", summary.unreadCount > 0 ? "text-black font-semibold" : "text-gray-500 font-medium")}>
            {summary.lastMessage || "Start talking..."}
          </p>
          {summary.unreadCount > 0 && <div className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{summary.unreadCount}</div>}
        </div>
      </div>
    </div>
  )
}

function ChatsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { toast } = useToast()
  const startWithId = searchParams.get("startWith")
  const { user: currentUser, loading: authLoading } = useUser()
  const db = useFirestore()
  const rtdb = useDatabase()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  const partnerPresence = useUserPresence(startWithId || undefined)
  
  const currentUserDocRef = useMemo(() => currentUser?.uid ? doc(db, "users", currentUser.uid) : null, [db, currentUser?.uid])
  const partnerDocRef = useMemo(() => startWithId ? doc(db, "users", startWithId) : null, [db, startWithId])
  
  const { data: currentUserProfile } = useDoc<UserProfile>(currentUserDocRef)
  const { data: partnerProfile } = useDoc<UserProfile>(partnerDocRef)

  const [chatId, setChatId] = useState<string | null>(null)
  const [newMessage, setNewMessage] = useState("")
  const [messages, setMessages] = useState<Message[]>([])
  const [userBalances, setUserBalances] = useState({ coins: 0, diamonds: 0 })
  const [chatSummaries, setChatSummaries] = useState<ChatSummary[]>([])
  const [summariesLoading, setSummariesLoading] = useState(true)
  const [isGiftDrawerOpen, setIsGiftDrawerOpen] = useState(false)
  const [selectedGift, setSelectedGift] = useState<any>(null)
  const [chatToDelete, setChatToDelete] = useState<ChatSummary | null>(null)
  const [activeDeletedAt, setActiveDeletedAt] = useState<number | null>(null)
  const [metadataLoading, setMetadataLoading] = useState(true)

  const isBlocked = useMemo(() => {
    if (!startWithId || !currentUserProfile || !partnerProfile) return false
    const blockedByMe = currentUserProfile.blocking?.includes(startWithId)
    const blockedByThem = currentUserProfile.blockedBy?.includes(startWithId) || partnerProfile.blocking?.includes(currentUser?.uid || "")
    return blockedByMe || blockedByThem
  }, [currentUserProfile, partnerProfile, startWithId, currentUser?.uid])

  useEffect(() => {
    if (!currentUser?.uid) return
    const summariesRef = ref(rtdb, `user_chats/${currentUser.uid}`)
    const unsubscribe = onValue(summariesRef, (snapshot) => {
      const data = snapshot.val()
      if (data) {
        const list = Object.entries(data)
          .map(([id, val]: [string, any]) => ({ id, ...val }))
          .filter(summary => !!summary.lastMessage)
          .sort((a, b) => b.lastMessageAt - a.lastMessageAt)
        setChatSummaries(list)
      } else {
        setChatSummaries([])
      }
      setSummariesLoading(false)
    })
    return () => off(summariesRef, 'value', unsubscribe)
  }, [rtdb, currentUser?.uid])

  useEffect(() => {
    if (chatId && currentUser?.uid) {
      setMetadataLoading(true)
      update(ref(rtdb, `user_chats/${currentUser.uid}/${chatId}`), { unreadCount: 0 })
      get(ref(rtdb, `user_chats/${currentUser.uid}/${chatId}/deletedAt`)).then((snap) => {
        setActiveDeletedAt(snap.val() || 0)
        setMetadataLoading(false)
      })
    } else {
      setActiveDeletedAt(null)
      setMetadataLoading(false)
    }
  }, [chatId, currentUser?.uid, rtdb])

  useEffect(() => {
    if (!chatId || metadataLoading || activeDeletedAt === null) {
      setMessages([])
      return
    }
    const messagesRef = rtdbQuery(ref(rtdb, `chat_messages/${chatId}`), limitToLast(30))
    const unsubscribe = onValue(messagesRef, (snapshot) => {
      const data = snapshot.val()
      if (data) {
        const msgs = Object.entries(data).map(([id, val]: [string, any]) => ({ id, ...val }))
        const filtered = msgs
          .filter(m => m.timestamp > (activeDeletedAt || 0))
          .sort((a, b) => b.timestamp - a.timestamp)
        setMessages(filtered)
      } else {
        setMessages([])
      }
    })
    return () => off(messagesRef, 'value', unsubscribe)
  }, [chatId, rtdb, activeDeletedAt, metadataLoading])

  useEffect(() => {
    if (!currentUser?.uid) return
    const balRef = ref(rtdb, `balances/${currentUser.uid}`)
    const unsubscribe = onValue(balRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val()
        setUserBalances({ coins: data.coins || 0, diamonds: data.diamonds || 0 })
      }
    })
    return () => off(balRef, 'value', unsubscribe)
  }, [rtdb, currentUser?.uid])

  useEffect(() => {
    if (!currentUser?.uid || !startWithId) {
      setChatId(null)
      return
    }
    const ids = [currentUser.uid, startWithId].sort()
    setChatId(`direct_${ids[0]}_${ids[1]}`)
  }, [currentUser?.uid, startWithId])

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || !chatId || !currentUser?.uid || !partnerProfile || isBlocked) return
    
    const sentText = text.trim()
    setNewMessage("") 

    const timestamp = Date.now()

    if (currentUserProfile?.gender === 'male' && !currentUserProfile?.isAdmin) {
      if (userBalances.coins < 15) {
        toast({ variant: "destructive", title: "Insufficient Coins" })
        return
      }
      
      await update(ref(rtdb, `balances/${currentUser.uid}`), { 
        coins: rtdbIncrement(-15),
        updatedAt: timestamp
      })

      await push(ref(rtdb, `coin_history/${currentUser.uid}`), {
        amount: -15,
        type: 'chat',
        description: `Chat with ${partnerProfile.name}`,
        timestamp: timestamp
      })
    }

    const msgData = { 
      text: sentText, 
      senderId: currentUser.uid, 
      timestamp 
    }
    
    await set(push(ref(rtdb, `chat_messages/${chatId}`)), msgData)

    const updates: any = {}
    updates[`user_chats/${currentUser.uid}/${chatId}/partnerId`] = partnerProfile.uid || ""
    updates[`user_chats/${currentUser.uid}/${chatId}/partnerName`] = partnerProfile.name || "Unknown"
    updates[`user_chats/${currentUser.uid}/${chatId}/partnerPhoto`] = partnerProfile.photoURL || ""
    updates[`user_chats/${currentUser.uid}/${chatId}/lastMessage`] = sentText
    updates[`user_chats/${currentUser.uid}/${chatId}/lastMessageAt`] = timestamp
    updates[`user_chats/${currentUser.uid}/${chatId}/unreadCount`] = 0

    updates[`user_chats/${partnerProfile.uid}/${chatId}/partnerId`] = currentUser.uid || ""
    updates[`user_chats/${partnerProfile.uid}/${chatId}/partnerName`] = currentUserProfile?.name || "User"
    updates[`user_chats/${partnerProfile.uid}/${chatId}/partnerPhoto`] = currentUserProfile?.photoURL || ""
    updates[`user_chats/${partnerProfile.uid}/${chatId}/lastMessage`] = sentText
    updates[`user_chats/${partnerProfile.uid}/${chatId}/lastMessageAt`] = timestamp
    updates[`user_chats/${partnerProfile.uid}/${chatId}/unreadCount`] = rtdbIncrement(1)

    await update(ref(rtdb), updates)
  }

  const handleStartCall = async (type: 'video' | 'voice') => {
    if (!currentUser || !partnerProfile || !chatId || isBlocked) return
    
    const minRequired = type === 'video' ? 150 : 70;
    if (userBalances.coins < minRequired) {
      toast({ variant: "destructive", title: "Insufficient Coins", description: `You need at least ${minRequired} coins to start this call.` });
      return;
    }

    // REMOVED: Strict online check to allow calling even if presence is pending
    // if (partnerPresence?.state !== 'online') { ... }

    const callData = {
      callerId: currentUser.uid,
      callerName: currentUserProfile?.name || "Someone",
      callerPhoto: currentUserProfile?.photoURL || "",
      type,
      chatId,
      timestamp: Date.now()
    }

    await set(ref(rtdb, `calls/${partnerProfile.uid}`), callData)
    
    router.push(`/call/${chatId}?type=${type}&caller=true&partner=${partnerProfile.name}`)
  }

  const handleSendGift = async (gift: any) => {
    if (!currentUser?.uid || !partnerProfile || !chatId || isBlocked) return
    if (userBalances.coins < gift.price) { toast({ variant: "destructive", title: "Insufficient Coins" }); return }
    try {
      const timestamp = Date.now()
      
      await update(ref(rtdb, `balances/${currentUser.uid}`), { 
        coins: rtdbIncrement(-gift.price),
        updatedAt: timestamp
      })
      
      await push(ref(rtdb, `coin_history/${currentUser.uid}`), {
        amount: -gift.price,
        type: 'gift',
        description: `Sent ${gift.name} to ${partnerProfile.name}`,
        timestamp: timestamp
      })

      const reward = Math.floor(gift.price * 0.5)
      await update(ref(rtdb, `balances/${partnerProfile.uid}`), { 
        diamonds: rtdbIncrement(reward),
        updatedAt: timestamp 
      })
      
      const text = `Sent a gift: ${gift.icon} ${gift.name}`
      await handleSendMessage(text)
      setIsGiftDrawerOpen(false)
      setSelectedGift(null)
    } catch (err) { toast({ variant: "destructive", title: "Gift Error" }) }
  }

  const handleDeleteChat = async () => {
    if (!currentUser?.uid || !chatToDelete) return
    try {
      const now = Date.now()
      await update(ref(rtdb, `user_chats/${currentUser.uid}/${chatToDelete.id}`), {
        lastMessage: "",
        unreadCount: 0,
        deletedAt: now
      })
      if (chatId === chatToDelete.id) setActiveDeletedAt(now)
      toast({ title: "Conversation removed" })
    } catch (err) {
      toast({ variant: "destructive", title: "Delete Error" })
    } finally {
      setChatToDelete(null)
    }
  }

  if (authLoading && chatSummaries.length === 0) {
    return <div className="flex-1 flex items-center justify-center h-screen bg-white"><Loader2 className="animate-spin text-[#00A2FF]" /></div>
  }

  if (!currentUser && !authLoading) {
    router.replace("/")
    return null
  }

  if (!startWithId) {
    return (
      <div className="flex-1 flex flex-col bg-white min-h-screen pb-20 select-none overflow-y-auto no-scrollbar">
        <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md px-4 pt-8 pb-3 flex items-center justify-between border-b">
          <h1 className="text-2xl font-bold text-[#00A2FF] tracking-tight">Chat</h1>
        </header>
        <main className="flex-1">
          {summariesLoading && chatSummaries.length === 0 ? (
            <div className="flex items-center justify-center py-20 opacity-20"><Loader2 className="animate-spin" /></div>
          ) : chatSummaries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 px-12 text-center opacity-40">
              <ShoppingBag className="w-16 h-16 mb-4" />
              <p className="font-semibold text-black">No chats yet...</p>
            </div>
          ) : chatSummaries.map(summary => (
            <ChatListItem 
              key={summary.id} 
              summary={summary} 
              onClick={() => router.push(`/chats?startWith=${summary.partnerId}`)}
              onDelete={() => setChatToDelete(summary)}
            />
          ))}
        </main>
        
        <BottomNav />

        <AlertDialog open={!!chatToDelete} onOpenChange={(open) => !open && setChatToDelete(null)}>
          <AlertDialogContent className="rounded-3xl max-w-[85vw] p-8 border-none select-none">
            <AlertDialogHeader className="items-center text-center">
              <AlertDialogTitle className="text-xl font-bold">Delete Chat?</AlertDialogTitle>
              <AlertDialogDescription>Confirm deletion.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-row gap-2 mt-6">
              <AlertDialogCancel className="flex-1 h-12 rounded-full border-none bg-gray-100 font-bold uppercase tracking-widest text-[10px]">Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteChat} className="flex-1 h-12 rounded-full bg-red-500 hover:bg-red-600 font-bold uppercase tracking-widest text-[10px]">Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-white overflow-hidden relative select-none">
      <header className="shrink-0 h-16 bg-white px-4 flex items-center justify-between border-b shadow-sm z-[100] sticky top-0">
        <Button variant="ghost" size="sm" onClick={() => router.push("/chats")} className="text-[#00A2FF]"><ChevronLeft className="w-6 h-6" /></Button>
        <div className="flex flex-col items-center flex-1 mx-2">
          <div className="flex items-center justify-center gap-1 max-w-full">
            <h3 className="font-semibold text-sm text-black truncate">{partnerProfile?.name || '...'}</h3>
            {partnerProfile?.isVerified && <BadgeCheck className="w-3.5 h-3.5 text-[#00A2FF] fill-white shrink-0" />}
          </div>
          {partnerPresence?.state === 'online' && <span className="text-[9px] font-bold text-green-500 uppercase">Online</span>}
        </div>
        
        <div className="flex items-center gap-1 mr-2">
           <Button variant="ghost" size="icon" className="text-[#00A2FF]" onClick={() => handleStartCall('voice')}><Phone className="w-5 h-5" /></Button>
           <Button variant="ghost" size="icon" className="text-[#00A2FF]" onClick={() => handleStartCall('video')}><Video className="w-5 h-5" /></Button>
        </div>

        <Avatar className="w-8 h-8 cursor-pointer" onClick={() => router.push(`/users/${startWithId}`)}>
          <AvatarImage src={partnerProfile?.photoURL || ""} />
          <AvatarFallback>{partnerProfile?.name?.[0] || "?"}</AvatarFallback>
        </Avatar>
      </header>

      <main className="flex-1 overflow-y-auto no-scrollbar flex flex-col-reverse p-4">
        <div className="flex flex-col-reverse space-y-4 space-y-reverse">
          <div ref={messagesEndRef} />
          {metadataLoading ? (
            <div className="flex items-center justify-center py-10 opacity-10"><Loader2 className="animate-spin" /></div>
          ) : messages.map((msg) => (
            <div key={msg.id} className={cn("flex items-end gap-2", msg.senderId === currentUser?.uid ? 'flex-row-reverse' : 'flex-row')}>
              <div className={cn("max-w-[75%] p-3.5 text-xs font-medium rounded-[1.2rem]", msg.senderId === currentUser?.uid ? 'bg-[#00A2FF] text-white rounded-br-none' : 'bg-gray-100 text-black rounded-bl-none')}>
                {msg.text}
              </div>
            </div>
          ))}
        </div>
      </main>

      <footer className="shrink-0 bg-white border-t p-4 flex items-center gap-3 z-50">
        {isBlocked ? (
          <div className="flex-1 py-3 px-6 bg-red-50 text-red-500 rounded-full text-center flex items-center justify-center gap-2">
            <Ban className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-widest">User Unavailable</span>
          </div>
        ) : (
          <>
            <Button variant="ghost" size="icon" onClick={() => setIsGiftDrawerOpen(true)} className="text-[#00A2FF]"><GiftIcon className="w-6 h-6" /></Button>
            <div className="flex-1 bg-gray-100 rounded-full h-11 px-5 flex items-center">
              <input 
                placeholder="Type..." 
                className="bg-transparent flex-1 outline-none text-sm" 
                value={newMessage} 
                onChange={(e) => setNewMessage(e.target.value)} 
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage(newMessage)} 
              />
            </div>
            <Button variant="ghost" onClick={() => handleSendMessage(newMessage)}><Send className="w-6 h-6 text-[#00A2FF]" /></Button>
          </>
        )}
      </footer>

      <Dialog open={isGiftDrawerOpen} onOpenChange={(open) => { setIsGiftDrawerOpen(open); if(!open) setSelectedGift(null); }}>
        <DialogContent className="bg-[#1A1C21] text-white rounded-t-[2.5rem] bottom-0 top-auto translate-y-0 max-w-md mx-auto p-8 pb-10 border-none [&>button]:hidden select-none z-[200]">
          <DialogTitle className="sr-only">Send a Gift</DialogTitle>
          <div className="flex justify-between items-center mb-6 px-2">
            <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-full">
              <Coins className="w-4 h-4 text-yellow-500" />
              <span className="text-xs font-bold">{userBalances.coins}</span>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Select a Gift</p>
          </div>
          
          <div className="grid grid-cols-4 gap-y-6 gap-x-2 mb-8">
            {GIFTS.map(gift => (
              <div 
                key={gift.id} 
                onClick={() => setSelectedGift(gift)} 
                className={cn(
                  "flex flex-col items-center gap-2 p-2 rounded-2xl transition-all active:scale-95 cursor-pointer border-2",
                  selectedGift?.id === gift.id ? "border-[#00A2FF] bg-white/5" : "border-transparent"
                )}
              >
                <span className="text-2xl">{gift.icon}</span>
                <span className="text-[10px] font-bold">{gift.name}</span>
                <span className="text-[9px] text-gray-400">{gift.price} Coins</span>
              </div>
            ))}
          </div>
          
          <Button 
            disabled={!selectedGift} 
            onClick={() => handleSendGift(selectedGift)}
            className="w-full h-14 rounded-full bg-[#00A2FF] text-white font-bold uppercase tracking-widest text-xs"
          >
            Send {selectedGift?.name}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function ChatsPage() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center h-screen bg-white"><Loader2 className="animate-spin text-[#00A2FF]" /></div>}>
      <ChatsContent />
    </Suspense>
  )
}
