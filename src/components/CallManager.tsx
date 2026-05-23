"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/firebase/auth/use-user"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Phone, PhoneOff, Video, User } from "lucide-react"

/**
 * @fileOverview Global Call Manager.
 * Acts as a listener at the root of the app to handle incoming calls regardless of current page.
 */
export function CallManager() {
  const router = useRouter()
  const { user } = useUser()
  const [incomingCall, setIncomingCall] = useState<any>(null)
  const ringtoneRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (!user?.id) return

    const channel = supabase.channel(`calls:${user.id}`)
      .on('broadcast', { event: 'incoming-call' }, (payload) => {
        setIncomingCall(payload.payload)
        
        // Start Global Ringtone
        if (!ringtoneRef.current) {
          ringtoneRef.current = new Audio('/notification.mp3')
          ringtoneRef.current.loop = true
        }
        ringtoneRef.current.play().catch(() => {})
        
        // Auto-reject after 45s of no response
        const timer = setTimeout(() => { 
          if (incomingCall) handleReject(); 
        }, 45000)
        
        return () => clearTimeout(timer)
      })
      .on('broadcast', { event: 'cancel-call' }, () => {
        stopRingtone()
        setIncomingCall(null)
      })
      .subscribe()

    return () => { 
      supabase.removeChannel(channel)
      stopRingtone() 
    }
  }, [user?.id, incomingCall])

  const stopRingtone = () => {
    if (ringtoneRef.current) {
      ringtoneRef.current.pause()
      ringtoneRef.current.currentTime = 0
    }
  }

  const handleAccept = () => {
    stopRingtone()
    const { chatId, type, callerName, callerId } = incomingCall
    setIncomingCall(null)
    router.push(`/call/${chatId}?type=${type}&partner=${encodeURIComponent(callerName)}&partnerId=${callerId}&caller=false`)
  }

  const handleReject = async () => {
    const callData = incomingCall
    stopRingtone()
    setIncomingCall(null)
    
    // Broadcast rejection back to caller
    supabase.channel(`calls:${callData.callerId}`).send({
      type: 'broadcast',
      event: 'call-rejected'
    })
    
    // Log rejection in chat history
    await supabase.from('messages').insert({ 
      chat_id: callData.chatId, 
      text: "[Rejected]", 
      sender_id: user!.id, 
      timestamp: Date.now() 
    })
  }

  if (!incomingCall) return null

  return (
    <div className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-3xl flex flex-col items-center justify-center p-8 animate-in fade-in duration-500">
      <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[url('https://picsum.photos/seed/call/800/1200')] bg-cover bg-center" />
      
      <div className="relative flex flex-col items-center gap-10 text-center z-10">
        <div className="relative">
          <div className="absolute -inset-10 bg-[#00A2FF] rounded-full blur-3xl opacity-20 animate-pulse" />
          <Avatar className="w-44 h-44 border-4 border-[#00A2FF] shadow-2xl relative z-10">
            <AvatarImage src={incomingCall.callerPhoto} className="object-cover" />
            <AvatarFallback className="bg-gray-800 text-white font-black text-4xl">
              {incomingCall.callerName?.[0]}
            </AvatarFallback>
          </Avatar>
        </div>

        <div className="space-y-2">
          <h2 className="text-4xl font-black text-white tracking-tight">{incomingCall.callerName}</h2>
          <p className="text-[#00A2FF] font-black uppercase tracking-[0.3em] text-xs animate-pulse">
            Incoming {incomingCall.type} call...
          </p>
        </div>

        <div className="flex gap-14 mt-6">
          <button 
            onClick={handleReject} 
            className="w-20 h-20 rounded-full bg-red-500 flex items-center justify-center shadow-[0_0_50px_rgba(239,68,68,0.4)] transition-all active:scale-90"
          >
            <PhoneOff className="text-white w-8 h-8" />
          </button>
          
          <button 
            onClick={handleAccept} 
            className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center shadow-[0_0_50px_rgba(34,197,94,0.4)] animate-bounce transition-all active:scale-90"
          >
            {incomingCall.type === 'video' ? <Video className="text-white w-8 h-8" /> : <Phone className="text-white w-8 h-8" />}
          </button>
        </div>
      </div>
    </div>
  )
}
