
"use client"

import { useEffect, useState, useRef, use } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { PhoneOff, Mic, MicOff, Video, VideoOff, User } from "lucide-react"
import { useUser } from "@/firebase/auth/use-user"
import { supabase } from "@/lib/supabase"
import { generateAgoraTokenAction, deductCallCoinsAction, endCallAction } from "@/app/actions/call-actions"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

/**
 * @fileOverview Agora Call Page implemented using Voice SDK Quick Start logic.
 * Optimized for stability and 40s answer timeout.
 */

export default function CallPage({ params }: { params: Promise<{ chatId: string }> }) {
  const { chatId } = use(params)
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user } = useUser()

  const type = searchParams.get("type") as 'video' | 'voice'
  const partnerId = searchParams.get("partnerId")
  const callId = searchParams.get("callId")

  const rtc = useRef<{ 
    client: any, 
    localAudioTrack: any, 
    localVideoTrack: any 
  }>({ 
    client: null, 
    localAudioTrack: null, 
    localVideoTrack: null 
  })
  
  const [joined, setJoined] = useState(false)
  const [muted, setMute] = useState(false)
  const [cameraOff, setCameraOff] = useState(type === 'voice')
  const [remoteUser, setRemoteUser] = useState<any>(null)
  const [partnerProfile, setPartnerProfile] = useState<any>(null)
  const [duration, setDuration] = useState(0)
  const [isRinging, setIsRinging] = useState(true)

  const localVideoRef = useRef<HTMLDivElement>(null)
  const remoteVideoRef = useRef<HTMLDivElement>(null)
  const billingTimer = useRef<NodeJS.Timeout | null>(null)
  const ringTimeout = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (!partnerId) return
    supabase.from('users').select('uid, name, photo_url').eq('uid', partnerId).single().then(({ data }) => setPartnerProfile(data))
  }, [partnerId])

  // REALTIME SIGNALING: Listen for "ended" status
  useEffect(() => {
    if (!callId) return
    const channel = supabase.channel(`call-sig-${callId}`)
      .on('postgres_changes', { event: 'UPDATE', table: 'calls', filter: `id=eq.${callId}` }, (payload) => {
        if (payload.new.status === 'ended') {
          handleEndCall(false)
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [callId])

  // 40 SECOND RINGING TIMEOUT
  useEffect(() => {
    if (joined && isRinging) {
      ringTimeout.current = setTimeout(() => {
        if (!remoteUser) handleEndCall(true)
      }, 40000)
    }
    return () => { if (ringTimeout.current) clearTimeout(ringTimeout.current) }
  }, [joined, isRinging, remoteUser])

  // BILLING TIMER (Starts when remote user joins)
  useEffect(() => {
    if (joined && remoteUser && user?.id && partnerId) {
      billingTimer.current = setInterval(async () => {
        setDuration(prev => {
          const next = prev + 1
          const isDeductionPoint = next === 11 || (next > 11 && (next - 11) % 60 === 0);
          if (isDeductionPoint) {
            deductCallCoinsAction(user.id, type, partnerId).then(res => {
              if (!res.success) handleEndCall(true)
            })
          }
          return next
        })
      }, 1000)
    }
    return () => { if (billingTimer.current) clearInterval(billingTimer.current) }
  }, [joined, remoteUser, user?.id, partnerId, type])

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      if (typeof window === 'undefined' || !user?.id || !chatId) return
      try {
        const AgoraRTC = (await import('agora-rtc-sdk-ng')).default
        const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" })
        const tokenData = await generateAgoraTokenAction(chatId, user.id)
        
        if (!mounted) return;

        // 1. Join Channel
        await client.join(tokenData.appId, tokenData.channelName, tokenData.token, tokenData.uid)
        
        // 2. Create Local Tracks
        const audioTrack = await AgoraRTC.createMicrophoneAudioTrack()
        let videoTrack = null
        if (type === 'video') {
          videoTrack = await AgoraRTC.createCameraVideoTrack()
        }

        if (!mounted) {
          audioTrack.close();
          if (videoTrack) videoTrack.close();
          await client.leave();
          return;
        }

        // 3. Publish Local Tracks
        await client.publish(videoTrack ? [audioTrack, videoTrack] : [audioTrack])
        
        if (localVideoRef.current && videoTrack) {
          videoTrack.play(localVideoRef.current)
        }

        rtc.current = { client, localAudioTrack: audioTrack, localVideoTrack: videoTrack }
        setJoined(true)

        // 4. Set up Remote Event Listeners (Quick Start Guide Logic)
        client.on("user-published", async (user, mediaType) => {
          await client.subscribe(user, mediaType)
          if (mediaType === "video") {
            setRemoteUser(user)
            setIsRinging(false)
            setTimeout(() => {
              if (remoteVideoRef.current) user.videoTrack?.play(remoteVideoRef.current)
            }, 100)
          }
          if (mediaType === "audio") {
            user.audioTrack?.play()
            setIsRinging(false)
            setRemoteUser(prev => prev || user)
          }
        })

        client.on("user-unpublished", (user) => {
          if (user.uid === remoteUser?.uid) setRemoteUser(null)
        })

        client.on("user-left", () => {
          handleEndCall(false)
        })
      } catch (err) {
        if (mounted) router.replace('/home')
      }
    }

    init()
    
    return () => { 
      mounted = false;
      const { client, localAudioTrack, localVideoTrack } = rtc.current;
      if (localAudioTrack) { localAudioTrack.stop(); localAudioTrack.close(); }
      if (localVideoTrack) { localVideoTrack.stop(); localVideoTrack.close(); }
      if (client) client.leave().catch(() => {});
    }
  }, [chatId, user?.id])

  const handleEndCall = async (manual = true) => {
    const { client, localAudioTrack, localVideoTrack } = rtc.current;
    if (localAudioTrack) { localAudioTrack.stop(); localAudioTrack.close(); }
    if (localVideoTrack) { localVideoTrack.stop(); localVideoTrack.close(); }
    if (client) { try { await client.leave() } catch (e) {} }
    if (manual && callId) { await endCallAction(callId) }
    router.replace(`/chats?startWith=${partnerId}`)
  }

  const toggleMute = () => {
    if (rtc.current.localAudioTrack) {
      rtc.current.localAudioTrack.setEnabled(muted)
      setMute(!muted)
    }
  }

  const toggleCamera = () => {
    if (rtc.current.localVideoTrack) {
      rtc.current.localVideoTrack.setEnabled(cameraOff)
      setCameraOff(!cameraOff)
    }
  }

  const formatDuration = (s: number) => {
    const mins = Math.floor(s / 60)
    const secs = s % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="fixed inset-0 bg-black z-[100] flex flex-col items-center justify-center select-none overflow-hidden">
      <div className="absolute inset-0 z-0">
        {type === 'video' && remoteUser ? (
          <div ref={remoteVideoRef} className="w-full h-full" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-900">
             <div className="relative">
               {isRinging && <div className="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-20" />}
               <Avatar className="w-32 h-32 border-4 border-white/10 shadow-2xl relative z-10">
                 <AvatarImage src={partnerProfile?.photo_url} className="object-cover" />
                 <AvatarFallback className="bg-zinc-800 text-zinc-500"><User className="w-16 h-16" /></AvatarFallback>
               </Avatar>
             </div>
             <h2 className="text-white text-2xl font-black mt-6 tracking-tight">{partnerProfile?.name || 'Connecting...'}</h2>
             <div className="flex flex-col items-center gap-2 mt-4">
                <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.3em]">
                  {joined ? (remoteUser ? formatDuration(duration) : 'Ringing...') : 'Initializing...'}
                </p>
                {remoteUser && duration < 11 && (
                  <div className="px-4 py-1.5 bg-green-500/20 text-green-400 rounded-full border border-green-500/30">
                    <p className="text-[10px] font-black uppercase tracking-widest">Free Preview: {10 - duration}s</p>
                  </div>
                )}
             </div>
          </div>
        )}
      </div>

      {type === 'video' && joined && !cameraOff && (
        <div className="absolute top-12 right-6 w-32 aspect-[3/4] bg-zinc-800 rounded-3xl overflow-hidden border-2 border-white/20 shadow-2xl z-20">
          <div ref={localVideoRef} className="w-full h-full" />
        </div>
      )}

      <div className="absolute bottom-16 inset-x-0 px-8 flex items-center justify-center gap-6 z-50">
        <button onClick={toggleMute} className={cn("w-16 h-16 rounded-full backdrop-blur-xl border border-white/10 shadow-2xl transition-all active:scale-90 flex items-center justify-center", muted ? "bg-red-500 text-white" : "bg-white/10 text-white")}>
          {muted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </button>
        <button onClick={() => handleEndCall(true)} className="w-20 h-20 rounded-full bg-red-600 text-white shadow-2xl shadow-red-500/40 border-4 border-white/10 active:scale-95 transition-all flex items-center justify-center">
          <PhoneOff className="w-8 h-8" />
        </button>
        {type === 'video' && (
          <button onClick={toggleCamera} className={cn("w-16 h-16 rounded-full backdrop-blur-xl border border-white/10 shadow-2xl transition-all active:scale-90 flex items-center justify-center", cameraOff ? "bg-red-500 text-white" : "bg-white/10 text-white")}>
            {cameraOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
          </button>
        )}
      </div>
    </div>
  )
}
