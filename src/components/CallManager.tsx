"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { ref, onValue, set, off } from "firebase/database"
import { useUser, useDatabase } from "@/firebase"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Phone, PhoneOff, Video, X, Minus, GripHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * @fileOverview Global listener for incoming calls with auto-decline and draggable minimize functionality.
 */
export function CallManager() {
  const router = useRouter()
  const { user } = useUser()
  const rtdb = useDatabase()
  
  const [incomingCall, setIncomingCall] = useState<any>(null)
  const [isMinimized, setIsMinimized] = useState(false)
  const [timeLeft, setTimeLeft] = useState(40)
  
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  
  const [position, setPosition] = useState({ x: 20, y: 100 })
  const [isDragging, setIsDragging] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })

  useEffect(() => {
    if (!user?.uid || !rtdb) return

    try {
      const callRef = ref(rtdb, `calls/${user.uid}`)
      const unsubscribe = onValue(callRef, (snap) => {
        if (snap.exists()) {
          const data = snap.val()
          setIncomingCall(data)
          setIsMinimized(false)
          setTimeLeft(40)
          
          if (timerRef.current) clearInterval(timerRef.current)
          timerRef.current = setInterval(() => {
            setTimeLeft((prev) => {
              if (prev <= 1) {
                handleReject() 
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
    } catch (err) {
      console.warn("[CallManager] Database listener failed:", err)
    }
  }, [user?.uid, rtdb])

  const handleAccept = async () => {
    if (!incomingCall || !user?.uid || !rtdb) return
    const { chatId, type, callerName } = incomingCall
    
    if (timerRef.current) clearInterval(timerRef.current)
    try {
      await set(ref(rtdb, `calls/${user.uid}`), null)
      router.push(`/call/${chatId}?type=${type}&partner=${encodeURIComponent(callerName)}`)
    } catch (err) {
      setIncomingCall(null)
    }
  }

  const handleReject = async () => {
    if (!user?.uid || !rtdb) return
    if (timerRef.current) clearInterval(timerRef.current)
    try {
      await set(ref(rtdb, `calls/${user.uid}`), null)
    } catch (err) {}
    setIncomingCall(null)
  }

  const startDrag = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDragging(true)
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    dragOffset.current = {
      x: window.innerWidth - clientX - position.x,
      y: window.innerHeight - clientY - position.y
    }
  }

  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!isDragging) return
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY
      
      setPosition({
        x: Math.max(10, Math.min(window.innerWidth - 100, window.innerWidth - clientX - dragOffset.current.x)),
        y: Math.max(10, Math.min(window.innerHeight - 100, window.innerHeight - clientY - dragOffset.current.y))
      })
    }
    const stopDrag = () => setIsDragging(false)

    if (isDragging) {
      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', stopDrag)
      window.addEventListener('touchmove', handleMove)
      window.addEventListener('touchend', stopDrag)
    }
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', stopDrag)
      window.removeEventListener('touchmove', handleMove)
      window.removeEventListener('touchend', stopDrag)
    }
  }, [isDragging])

  if (!incomingCall) return null

  if (!isMinimized) {
    return (
      <div className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-3xl flex flex-col items-center justify-center p-8 animate-in fade-in zoom-in-95 duration-500 select-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#00A2FF]/10 rounded-full blur-[120px] animate-pulse" />
        
        <div className="absolute top-12 right-6">
          <Button variant="ghost" size="icon" onClick={() => setIsMinimized(true)} className="text-white/40 hover:text-white rounded-full bg-white/5">
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
            <button onClick={handleReject} className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center shadow-2xl hover:bg-red-500 transition-all active:scale-90 group">
              <PhoneOff className="w-8 h-8 text-red-500 group-hover:text-white fill-current" />
            </button>
            <button onClick={handleAccept} className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center shadow-[0_0_50px_rgba(34,197,94,0.4)] active:scale-90 transition-all animate-bounce">
              {incomingCall.type === 'video' ? <Video className="w-8 h-8 text-white fill-current" /> : <Phone className="w-8 h-8 text-white fill-current" />}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div 
      className={cn("fixed z-[9999] cursor-pointer select-none touch-none active:scale-105 transition-transform", isDragging && "scale-110")}
      style={{ right: position.x, bottom: position.y }}
      onMouseDown={startDrag}
      onTouchStart={startDrag}
    >
      <div className="relative group">
        <div className="absolute inset-0 rounded-full bg-[#00A2FF] animate-ping opacity-20" />
        <div className="bg-black/80 backdrop-blur-xl border-2 border-[#00A2FF] rounded-2xl p-2 flex items-center gap-3 shadow-2xl animate-in slide-in-from-right-10">
          <Avatar className="w-10 h-10 border border-white/10" onClick={() => setIsMinimized(false)}>
            <AvatarImage src={incomingCall.callerPhoto} className="object-cover" />
            <AvatarFallback className="bg-blue-600 text-white font-bold">{incomingCall.callerName?.[0]}</AvatarFallback>
          </Avatar>
          <div className="pr-2" onClick={() => setIsMinimized(false)}>
            <p className="text-[10px] font-black text-white uppercase tracking-tight truncate max-w-[80px]">{incomingCall.callerName}</p>
            <span className="text-[8px] font-bold text-[#00A2FF] uppercase">{timeLeft}s</span>
          </div>
          <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full bg-white/5 hover:bg-[#00A2FF] text-white" onClick={(e) => { e.stopPropagation(); handleAccept(); }}>
            <Phone className="w-4 h-4 fill-current" />
          </Button>
        </div>
      </div>
    </div>
  )
}
