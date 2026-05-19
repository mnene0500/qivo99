
"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { ref, onValue, set, off } from "firebase/database"
import { useUser, useDatabase } from "@/firebase"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Phone, PhoneOff, Video, X, Minus, Maximize2 } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * @fileOverview Global listener for incoming calls with auto-decline and minimize functionality.
 */
export function CallManager() {
  const router = useRouter()
  const { user } = useUser()
  const rtdb = useDatabase()
  
  const [incomingCall, setIncomingCall] = useState<any>(null)
  const [isMinimized, setIsMinimized] = useState(false)
  const [timeLeft, setTimeLeft] = useState(40)
  
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const ringtoneRef = useRef<HTMLAudioElement | null>(null)

  // DRAG LOGIC FOR MINIMIZED BUBBLE
  const [position, setPosition] = useState({ x: 20, y: 80 })
  const isDragging = useRef(false)

  useEffect(() => {
    if (!user?.uid) return

    const callRef = ref(rtdb, `calls/${user.uid}`)
    const unsubscribe = onValue(callRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val()
        setIncomingCall(data)
        setIsMinimized(false)
        setTimeLeft(40)
        
        // Start 40s countdown
        if (timerRef.current) clearInterval(timerRef.current)
        timerRef.current = setInterval(() => {
          setTimeLeft((prev) => {
            if (prev <= 1) {
              handleReject() // Auto-decline
              return 0
            }
            return prev - 1
          })
        }, 1000)
      } else {
        setIncomingCall(null)
        if (timerRef.current) clearInterval(timerRef.current)
      }
    })

    return () => {
      off(callRef, 'value', unsubscribe)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [user?.uid, rtdb])

  const handleAccept = async () => {
    if (!incomingCall || !user?.uid) return
    const { chatId, type } = incomingCall
    
    if (timerRef.current) clearInterval(timerRef.current)
    await set(ref(rtdb, `calls/${user.uid}`), null)
    router.push(`/call/${chatId}?type=${type}`)
  }

  const handleReject = async () => {
    if (!user?.uid) return
    if (timerRef.current) clearInterval(timerRef.current)
    await set(ref(rtdb, `calls/${user.uid}`), null)
    setIncomingCall(null)
  }

  if (!incomingCall) return null

  // FULL SCREEN VIEW
  if (!isMinimized) {
    return (
      <div className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-3xl flex flex-col items-center justify-center p-8 animate-in fade-in zoom-in-95 duration-500 select-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#00A2FF]/10 rounded-full blur-[120px] animate-pulse" />
        
        <div className="absolute top-12 right-6">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setIsMinimized(true)}
            className="text-white/40 hover:text-white rounded-full bg-white/5"
          >
            <Minus className="w-6 h-6" />
          </Button>
        </div>

        <div className="relative z-10 flex flex-col items-center space-y-12 text-center w-full max-w-sm">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-[#00A2FF]/20 animate-ping duration-[2000ms]" />
            <Avatar className="w-32 h-32 border-4 border-[#00A2FF] shadow-2xl relative z-10">
              <AvatarImage src={incomingCall.callerPhoto} className="object-cover" />
              <AvatarFallback className="bg-blue-600 text-white text-4xl font-bold">
                {incomingCall.callerName?.[0]}
              </AvatarFallback>
            </Avatar>
            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-[#00A2FF] px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] text-white shadow-xl z-20 whitespace-nowrap">
              Incoming {incomingCall.type}
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-4xl font-black text-white tracking-tighter">{incomingCall.callerName}</h2>
            <div className="flex flex-col items-center gap-1">
              <p className="text-[#00A2FF] font-black uppercase tracking-[0.3em] text-[10px] animate-pulse">Ringing...</p>
              <p className="text-white/20 font-bold text-[9px] uppercase tracking-widest">Auto-decline in {timeLeft}s</p>
            </div>
          </div>

          <div className="flex gap-12 items-center pt-8">
            <div className="flex flex-col items-center gap-3">
              <button 
                onClick={handleReject}
                className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center shadow-2xl hover:bg-red-500 transition-all active:scale-90 group"
              >
                <PhoneOff className="w-8 h-8 text-red-500 group-hover:text-white fill-current" />
              </button>
              <span className="text-[10px] font-bold text-red-500/60 uppercase tracking-widest">Decline</span>
            </div>
            
            <div className="flex flex-col items-center gap-3">
              <button 
                onClick={handleAccept}
                className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center shadow-[0_0_50px_rgba(34,197,94,0.4)] active:scale-90 transition-all animate-bounce"
              >
                {incomingCall.type === 'video' ? (
                  <Video className="w-8 h-8 text-white fill-current" />
                ) : (
                  <Phone className="w-8 h-8 text-white fill-current" />
                )}
              </button>
              <span className="text-[10px] font-bold text-green-500 uppercase tracking-widest">Answer</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // MINIMIZED FLOATING BUBBLE
  return (
    <div 
      className="fixed z-[9999] cursor-pointer group"
      style={{ right: position.x, bottom: position.y }}
      onClick={() => setIsMinimized(false)}
    >
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-[#00A2FF] animate-ping opacity-20" />
        <div className="bg-black/80 backdrop-blur-xl border-2 border-[#00A2FF] rounded-2xl p-2 flex items-center gap-3 shadow-2xl animate-in slide-in-from-right-10">
          <Avatar className="w-10 h-10 border border-white/10">
            <AvatarImage src={incomingCall.callerPhoto} className="object-cover" />
            <AvatarFallback className="bg-blue-600 text-white font-bold">{incomingCall.callerName?.[0]}</AvatarFallback>
          </Avatar>
          <div className="pr-2">
            <p className="text-[10px] font-black text-white uppercase tracking-tight truncate max-w-[80px]">{incomingCall.callerName}</p>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              <span className="text-[8px] font-bold text-[#00A2FF] uppercase">{timeLeft}s</span>
            </div>
          </div>
          <Button 
            size="icon" 
            variant="ghost" 
            className="h-8 w-8 rounded-full bg-white/5 hover:bg-[#00A2FF] text-white transition-colors"
            onClick={(e) => { e.stopPropagation(); handleAccept(); }}
          >
            <Phone className="w-4 h-4 fill-current" />
          </Button>
        </div>
        <div className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => { e.stopPropagation(); handleReject(); }}>
          <X className="w-3 h-3" />
        </div>
      </div>
    </div>
  )
}
