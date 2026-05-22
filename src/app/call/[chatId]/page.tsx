"use client"

import { useEffect, useRef, use, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/firebase/auth/use-user"
import { PhoneOff, Mic, MicOff, Video, VideoOff, Loader2, AlertCircle } from "lucide-react"
import { deductCallCoinsAction, checkCallBalanceAction, getZegoConfigAction } from "@/app/actions/call-actions"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * @fileOverview Production-Secure Video & Voice Calling Page.
 * Uses Server Actions to fetch credentials and handle per-minute billing.
 */
export default function CallPage({ params }: { params: Promise<{ chatId: string }> }) {
  const { chatId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useUser()
  const { toast } = useToast()
  
  const containerRef = useRef<HTMLDivElement>(null)
  const zpRef = useRef<any>(null)
  const billingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  
  const isVideo = searchParams.get('type') !== 'voice'
  const isCaller = searchParams.get('caller') === 'true'
  const partnerName = searchParams.get('partner') || "Partner"
  const partnerId = searchParams.get('partnerId') || ""
  
  const [micEnabled, setMicEnabled] = useState(true)
  const [cameraEnabled, setCameraEnabled] = useState(isVideo)
  const [isReady, setIsReady] = useState(false)
  const [configError, setConfigError] = useState<string | null>(null)

  // 1. SIGNALING
  useEffect(() => {
    if (!user || !partnerId) return

    if (isCaller) {
      supabase.channel(`calls:${partnerId}`).send({
        type: 'broadcast',
        event: 'incoming-call',
        payload: { 
          chatId, 
          type: isVideo ? 'video' : 'voice', 
          callerId: user.id, 
          callerName: user.user_metadata?.full_name || user.email?.split('@')[0] || "User", 
          callerPhoto: user.user_metadata?.avatar_url 
        }
      })
    }

    const channel = supabase.channel(`calls:${user.id}`)
      .on('broadcast', { event: 'call-rejected' }, () => { 
        toast({ title: "Call Declined" }); 
        hangUp(); 
      })
      .on('broadcast', { event: 'cancel-call' }, () => {
        toast({ title: "Call Cancelled" });
        hangUp();
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user, partnerId, isCaller])

  // 2. SECURE BILLING LOOP
  const startBillingLoop = () => {
    if (!isCaller || !user || !partnerId) return
    
    // Initial charge immediately upon connection
    deductCallCoinsAction(user.id, isVideo ? 'video' : 'voice', partnerId, partnerName)

    billingIntervalRef.current = setInterval(async () => {
      const balanceCheck = await checkCallBalanceAction(user.id, isVideo ? 'video' : 'voice')
      if (!balanceCheck.success) {
        toast({ variant: "destructive", title: "Balance Depleted", description: "Call ended." })
        hangUp()
        return
      }
      deductCallCoinsAction(user.id, isVideo ? 'video' : 'voice', partnerId, partnerName)
    }, 60000) 
  }

  // 3. INITIALIZE ZEGO
  useEffect(() => {
    if (!user || !containerRef.current) return

    const initCall = async () => {
      try {
        const config = await getZegoConfigAction();
        if (!config.success || !config.appId || !config.serverSecret) {
          setConfigError(config.error || "Calling service is currently unavailable.");
          return;
        }

        const { ZegoUIKitPrebuilt } = await import('@zegocloud/zego-uikit-prebuilt')
        
        // TOKEN GENERATION: Uses server secret obtained via secure action
        const kitToken = ZegoUIKitPrebuilt.generateKitTokenForTest(
          config.appId,
          config.serverSecret,
          chatId,
          user.id,
          user.user_metadata?.full_name || user.email?.split('@')[0] || "User"
        )

        const zp = ZegoUIKitPrebuilt.create(kitToken)
        zpRef.current = zp
        zp.joinRoom({
          container: containerRef.current,
          mode: ZegoUIKitPrebuilt.OneONoneCall,
          showPreJoinView: false,
          turnOnCameraWhenJoining: isVideo,
          turnOnMicrophoneWhenJoining: true,
          showMyCameraToggleButton: isVideo,
          showAudioVideoSettingsButton: false,
          showMyDeviceStatusIcon: false,
          onUserJoin: (joinedUser) => {
            if (joinedUser.userID !== user.id) {
              startBillingLoop()
            }
          },
          onLeaveRoom: () => hangUp(),
        })
        setIsReady(true)
      } catch (err) {
        console.error("Zego Init Error:", err);
        setConfigError("Failed to connect to the call server.");
      }
    }
    initCall()

    return () => { if (billingIntervalRef.current) clearInterval(billingIntervalRef.current) }
  }, [user, chatId])

  const hangUp = () => {
    if (billingIntervalRef.current) clearInterval(billingIntervalRef.current)
    if (zpRef.current) {
      try { zpRef.current.leaveRoom() } catch (e) {}
    }
    if (isCaller && partnerId) {
      supabase.channel(`calls:${partnerId}`).send({ type: 'broadcast', event: 'cancel-call' })
    }
    router.replace("/chats")
  }

  if (configError) {
    return (
      <div className="w-full h-screen bg-black flex flex-col items-center justify-center p-8 space-y-6">
        <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center">
           <AlertCircle className="w-10 h-10 text-red-500" />
        </div>
        <div className="text-center space-y-2">
           <h2 className="text-xl font-bold text-white">Call Error</h2>
           <p className="text-sm text-gray-400 max-w-xs">{configError}</p>
        </div>
        <Button onClick={() => router.back()} className="rounded-full bg-white text-black font-bold uppercase tracking-widest px-8">Go Back</Button>
      </div>
    )
  }

  return (
    <div className="w-full h-screen bg-black relative flex flex-col items-center justify-center overflow-hidden">
      {!isReady && (
        <div className="flex flex-col items-center gap-6 text-white animate-pulse">
           <div className="relative">
             <div className="w-24 h-24 border-4 border-blue-500/20 rounded-full" />
             <div className="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
           </div>
           <div className="text-center space-y-1">
             <p className="text-sm font-black uppercase tracking-[0.3em]">Connecting</p>
             <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Securing Line...</p>
           </div>
        </div>
      )}
      
      <div ref={containerRef} className="w-full h-full" />
      
      {isReady && (
        <div className="absolute bottom-12 inset-x-0 flex justify-center items-center gap-8 z-50">
          <button 
            onClick={() => { setMicEnabled(!micEnabled); zpRef.current?.enableMicrophone(!micEnabled); }} 
            className={cn("w-16 h-16 rounded-full backdrop-blur-xl border border-white/20 flex items-center justify-center transition-all active:scale-90", micEnabled ? "bg-white/10 text-white" : "bg-red-500 text-white")}
          >
            {micEnabled ? <Mic /> : <MicOff />}
          </button>
          
          <button 
            onClick={hangUp} 
            className="w-20 h-20 rounded-full bg-red-600 flex items-center justify-center shadow-[0_0_50px_rgba(220,38,38,0.4)] active:scale-90 transition-transform"
          >
            <PhoneOff className="text-white w-8 h-8" />
          </button>
          
          {isVideo && (
            <button 
              onClick={() => { setCameraEnabled(!cameraEnabled); zpRef.current?.enableCamera(!cameraEnabled); }} 
              className={cn("w-16 h-16 rounded-full backdrop-blur-xl border border-white/20 flex items-center justify-center transition-all active:scale-90", cameraEnabled ? "bg-white/10 text-white" : "bg-red-500 text-white")}
            >
              {cameraEnabled ? <Video /> : <VideoOff />}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
