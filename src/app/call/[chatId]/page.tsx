
"use client"

import { useEffect, useState, useRef, use } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { PhoneOff, Mic, MicOff, Video, VideoOff, User, Loader2, AlertCircle, SwitchCamera, Minimize2, Maximize2 } from "lucide-react"
import { useUser } from "@/firebase/auth/use-user"
import { supabase } from "@/lib/supabase"
import { generateAgoraTokenAction, deductCallCoinsAction, endCallAction } from "@/app/actions/call-actions"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

/**
 * @fileOverview Overhauled Agora Call Page with PIP and Status Logging.
 * Fixed: Timer starts ONLY on connection. Automatic termination for insufficient coins.
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
  }>({ client: null, localAudioTrack: null, localVideoTrack: null })
  
  const [joined, setJoined] = useState(false)
  const [muted, setMuted] = useState(false)
  const [cameraOff, setCameraOff] = useState(type === 'voice')
  const [remoteUser, setRemoteUser] = useState<any>(null)
  const [partnerProfile, setPartnerProfile] = useState<any>(null)
  const [duration, setDuration] = useState(0)
  const [isRinging, setIsRinging] = useState(true)
  const [permissionError, setPermissionError] = useState<string | null>(null)
  const [isMinimized, setIsMinimized] = useState(false)

  const localVideoRef = useRef<HTMLDivElement>(null)
  const remoteVideoRef = useRef<HTMLDivElement>(null)
  const billingTimer = useRef<NodeJS.Timeout | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    if (!partnerId) return
    supabase.from('users').select('uid, name, photo_url').eq('uid', partnerId).single().then(({ data }) => {
      if (mounted.current) setPartnerProfile(data)
    })
    return () => { mounted.current = false }
  }, [partnerId])

  useEffect(() => {
    if (!callId) return
    const channel = supabase.channel(`call-mon-${callId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'calls', filter: `id=eq.${callId}` }, (payload) => {
        if (payload.new.status === 'ended' && mounted.current) {
          handleEndCall(false, payload.new.reason || 'Call Ended');
        }
      }).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [callId])

  // ACCURATE TIMER & BILLING: Starts only when connected (remoteUser present)
  useEffect(() => {
    if (joined && remoteUser && user?.id && partnerId) {
      billingTimer.current = setInterval(async () => {
        if (!mounted.current) return;
        
        setDuration(prev => {
          const next = prev + 1
          // Logic: 10s free, deduct at 11s (1st min), then at 61s, 121s...
          const isDeductionPoint = next === 11 || (next > 60 && (next - 1) % 60 === 0);
          
          if (isDeductionPoint) {
            deductCallCoinsAction(user.id, type, partnerId).then(res => {
              if (!res.success && mounted.current) {
                // Terminate call due to insufficient funds
                handleEndCall(true, 'Insufficient Balance');
              }
            })
          }
          return next
        })
      }, 1000)
    }
    return () => { if (billingTimer.current) clearInterval(billingTimer.current) }
  }, [joined, !!remoteUser, user?.id, partnerId, type])

  useEffect(() => {
    const init = async () => {
      if (typeof window === 'undefined' || !user?.id) return
      try {
        const AgoraRTC = (await import('agora-rtc-sdk-ng')).default
        const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" })
        rtc.current.client = client

        client.on("user-published", async (remote, mediaType) => {
          await client.subscribe(remote, mediaType)
          if (mediaType === "video") {
            setRemoteUser(remote)
            setIsRinging(false)
            setTimeout(() => { if (remoteVideoRef.current) remote.videoTrack?.play(remoteVideoRef.current) }, 300)
          }
          if (mediaType === "audio") {
            remote.audioTrack?.play()
            setIsRinging(false)
            setRemoteUser((prev: any) => prev || remote)
          }
        })

        client.on("user-left", () => { if (mounted.current) handleEndCall(false) })

        // 1. Request Microphone
        const audioTrack = await AgoraRTC.createMicrophoneAudioTrack().catch(e => {
          throw new Error("Microphone permission denied. Please enable it in browser settings.");
        });
        rtc.current.localAudioTrack = audioTrack;

        // 2. Request Camera (if video)
        if (type === 'video') {
          const videoTrack = await AgoraRTC.createCameraVideoTrack({ facingMode: "user" }).catch(e => {
            console.warn("Camera failed", e);
            return null;
          });
          if (videoTrack) {
            rtc.current.localVideoTrack = videoTrack;
            if (localVideoRef.current) videoTrack.play(localVideoRef.current);
          }
        }

        // 3. Join & Publish
        const tokenData = await generateAgoraTokenAction(chatId, user.id);
        await client.join(tokenData.appId, tokenData.channelName, tokenData.token, tokenData.uid);
        
        const tracks: any[] = [rtc.current.localAudioTrack];
        if (rtc.current.localVideoTrack) tracks.push(rtc.current.localVideoTrack);
        
        await client.publish(tracks);
        setJoined(true);
        
        if (callId) await supabase.from('calls').update({ status: 'active' }).eq('id', callId);

      } catch (err: any) {
        setPermissionError(err.message || "Hardware setup failed.");
      }
    }
    init()
    return () => { shutdownAgora() }
  }, [chatId, user?.id, type, callId])

  const shutdownAgora = async () => {
    if (rtc.current.localAudioTrack) { rtc.current.localAudioTrack.stop(); rtc.current.localAudioTrack.close(); }
    if (rtc.current.localVideoTrack) { rtc.current.localVideoTrack.stop(); rtc.current.localVideoTrack.close(); }
    if (rtc.current.client) { await rtc.current.client.leave().catch(() => {}); }
  }

  const handleEndCall = async (manual = true, overrideReason?: string) => {
    await shutdownAgora()
    
    if (manual && callId) {
      let reason = overrideReason || 'Call Ended';
      if (!remoteUser && isRinging) {
        reason = 'Cancelled';
      } else if (remoteUser) {
        const m = Math.floor(duration / 60);
        const s = duration % 60;
        reason = `Duration: ${m}:${s.toString().padStart(2, '0')}`;
      }
      await endCallAction(callId, reason);
    }
    
    if (mounted.current) router.replace(`/chats?startWith=${partnerId}`);
  }

  if (permissionError) return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center p-10 text-center z-[200]">
      <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
      <h2 className="text-white font-bold text-xl mb-2">Hardware Error</h2>
      <p className="text-gray-400 text-sm mb-10 leading-relaxed">{permissionError}</p>
      <Button onClick={() => router.back()} className="rounded-2xl h-14 px-10 bg-[#00A2FF] text-white font-black uppercase tracking-widest text-xs">Go Back</Button>
    </div>
  )

  if (isMinimized) return (
    <div className="fixed bottom-24 right-4 z-[999] w-20 h-20 rounded-full bg-blue-500 shadow-2xl flex items-center justify-center border-4 border-white active:scale-95 transition-all cursor-pointer" onClick={() => setIsMinimized(false)}>
      <div className="relative">
        <Avatar className="w-16 h-16"><AvatarImage src={partnerProfile?.photo_url} /><AvatarFallback><User /></AvatarFallback></Avatar>
        <div className="absolute -top-1 -right-1 bg-green-500 w-4 h-4 rounded-full border-2 border-white animate-pulse" />
      </div>
    </div>
  )

  const formattedTime = `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}`;

  return (
    <div className="fixed inset-0 bg-black z-[100] flex flex-col overflow-hidden select-none">
      <div className="absolute inset-0 z-0">
        {type === 'video' && remoteUser ? <div ref={remoteVideoRef} className="w-full h-full" /> : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-900">
             <div className="relative">
               {isRinging && <div className="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-20" />}
               <Avatar className="w-40 h-40 border-4 border-white/10 shadow-2xl relative z-10">
                 <AvatarImage src={partnerProfile?.photo_url} className="object-cover" />
                 <AvatarFallback><User className="w-16 h-16 text-zinc-700" /></AvatarFallback>
               </Avatar>
             </div>
             <h2 className="text-white text-2xl font-black mt-8 tracking-tight">{partnerProfile?.name || 'Connecting...'}</h2>
             <p className={cn(
               "text-[10px] font-black uppercase tracking-[0.4em] mt-4 transition-colors",
               remoteUser ? "text-green-500" : "text-zinc-500"
             )}>
               {remoteUser ? `Connected • ${formattedTime}` : 'Ringing...'}
             </p>
          </div>
        )}
      </div>

      {/* TOP CONTROLS */}
      <div className="absolute top-12 left-6 z-50 flex items-center gap-3">
        <button onClick={() => setIsMinimized(true)} className="p-3 bg-white/10 backdrop-blur-xl rounded-2xl border border-white/10 text-white shadow-xl active:scale-90 transition-transform"><Minimize2 className="w-5 h-5" /></button>
        {remoteUser && (
          <div className="px-4 py-2 bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 text-white font-black text-xs tracking-widest">
            {formattedTime}
          </div>
        )}
      </div>

      {type === 'video' && (
        <div className={cn("absolute transition-all duration-500 overflow-hidden border-2 border-white/20 shadow-2xl z-20", remoteUser ? "top-12 right-6 w-32 aspect-[3/4] rounded-3xl" : "inset-0 rounded-none z-[5]")}>
          <div ref={localVideoRef} className={cn("w-full h-full bg-zinc-800", (cameraOff || !rtc.current.localVideoTrack) && "opacity-0")} />
        </div>
      )}

      {/* BOTTOM CONTROLS */}
      <div className="absolute bottom-12 inset-x-0 px-8 flex items-center justify-center gap-4 z-50">
        <button 
          onClick={() => { setMuted(!muted); rtc.current.localAudioTrack?.setEnabled(muted); }} 
          className={cn(
            "w-16 h-16 rounded-full backdrop-blur-xl border border-white/10 shadow-2xl transition-all flex items-center justify-center", 
            muted ? "bg-red-500 text-white" : "bg-white/10 text-white"
          )}
        >
          {muted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </button>
        
        <button onClick={() => handleEndCall(true)} className="w-20 h-20 rounded-full bg-red-600 text-white shadow-2xl shadow-red-500/40 border-4 border-white/10 flex items-center justify-center active:scale-95 transition-all"><PhoneOff className="w-8 h-8" /></button>
        
        {type === 'video' && (
          <button 
            onClick={() => { setCameraOff(!cameraOff); rtc.current.localVideoTrack?.setEnabled(cameraOff); }} 
            className={cn(
              "w-16 h-16 rounded-full backdrop-blur-xl border border-white/10 shadow-2xl transition-all flex items-center justify-center", 
              cameraOff ? "bg-red-500 text-white" : "bg-white/10 text-white"
            )}
          >
            {cameraOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
          </button>
        )}
      </div>
    </div>
  )
}
