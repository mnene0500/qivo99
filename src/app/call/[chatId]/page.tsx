
"use client"

import { useEffect, useRef, use, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useUser, useDoc, useFirestore, useDatabase } from "@/firebase"
import { doc } from "firebase/firestore"
import { ref, onValue, off, set } from "firebase/database"
import { 
  Loader2, 
  Coins, 
  AlertCircle, 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  PhoneOff, 
  ShieldCheck 
} from "lucide-react"
import { deductCallCoinsAction } from "@/app/actions/call-actions"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * @fileOverview Custom 1-on-1 Call Interface.
 * Optimized for hyper-fast connection with zero-latency visual transition and hardware cleanup.
 */
export default function CallPage({ params }: { params: Promise<{ chatId: string }> }) {
  const { chatId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useUser()
  const db = useFirestore()
  const rtdb = useDatabase()
  const { toast } = useToast()
  
  const containerRef = useRef<HTMLDivElement>(null)
  const billingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const zpRef = useRef<any>(null)
  
  const isVideo = searchParams.get('type') !== 'voice'
  const isCaller = searchParams.get('caller') === 'true'
  const partnerName = searchParams.get('partner') || "Partner"
  const partnerId = searchParams.get('partnerId')
  
  const { data: profile } = useDoc<any>(user?.uid && db ? doc(db, "users", user.uid) : null)
  const [currentBalance, setCurrentBalance] = useState<number>(0)
  const [error, setError] = useState<string | null>(null)
  
  const [micEnabled, setMicEnabled] = useState(true)
  const [cameraEnabled, setCameraEnabled] = isVideo ? useState(true) : [false, () => {}]

  // Listen to balance updates
  useEffect(() => {
    if (!user?.uid || !rtdb) return
    const balRef = ref(rtdb, `balances/${user.uid}/coins`)
    const unsubscribe = onValue(balRef, (snap) => {
      setCurrentBalance(snap.val() || 0)
    })
    return () => off(balRef, 'value', unsubscribe)
  }, [user?.uid, rtdb])

  // Listen to call status (Decline detection)
  useEffect(() => {
    if (!rtdb || !partnerId || !isCaller) return
    const callSignalRef = ref(rtdb, `calls/${partnerId}`)
    const unsubscribe = onValue(callSignalRef, (snap) => {
      if (!snap.exists()) {
         // If signal is gone before we start billing, it means rejection or cancellation
         if (!billingIntervalRef.current) {
            toast({ title: "Call Ended", description: `${partnerName} disconnected.` });
            hangUp();
         }
      }
    })
    return () => off(callSignalRef, 'value', unsubscribe)
  }, [rtdb, partnerId, isCaller, partnerName])

  const handleDeduction = async () => {
    if (!user || !isCaller) return true;
    
    const type = isVideo ? 'video' : 'voice';
    const result = await deductCallCoinsAction(user.uid, type, partnerName);
    
    if (!result.success) {
      toast({ variant: "destructive", title: "Call Terminated", description: result.error });
      hangUp();
      return false;
    }
    return true;
  }

  useEffect(() => {
    if (!user || !profile || !containerRef.current) return

    const initCall = async () => {
      try {
        const { ZegoUIKitPrebuilt } = await import('@zegocloud/zego-uikit-prebuilt')
        
        const appID = Number(process.env.NEXT_PUBLIC_ZEGO_APP_ID)
        const serverSecret = process.env.NEXT_PUBLIC_ZEGO_SERVER_SECRET
        
        if (!appID || !serverSecret) {
          setError("SERVICE OFFLINE: Vercel Redeploy Required.")
          return
        }

        const kitToken = ZegoUIKitPrebuilt.generateKitTokenForTest(
          appID,
          serverSecret,
          chatId,
          user.uid,
          profile.name || "User"
        )

        const zp = ZegoUIKitPrebuilt.create(kitToken)
        zpRef.current = zp;
        
        zp.joinRoom({
          container: containerRef.current,
          mode: ZegoUIKitPrebuilt.OneONoneCall,
          showPreJoinView: false,
          showMyDeviceStatusIcon: false,
          showAudioVideoSettingsButton: false,
          showScreenSharingButton: false,
          showUserHideButton: false,
          showLeavingView: false,
          showTextChat: false,
          showUserList: false,
          turnOnCameraWhenJoining: isVideo,
          turnOnMicrophoneWhenJoining: true,
          showMyCameraToggleButton: isVideo,
          showAudioVideoSettings: false,
          layout: "Auto",
          scenario: {
            mode: isVideo ? ZegoUIKitPrebuilt.VideoCall : ZegoUIKitPrebuilt.VoiceCall,
          },
          onUserJoin: async (joinedUser) => {
            if (isCaller && joinedUser.userID !== user.uid && !billingIntervalRef.current) {
               const success = await handleDeduction();
               if (success) {
                 billingIntervalRef.current = setInterval(handleDeduction, 60000);
               }
            }
          },
          onUserLeave: () => hangUp(),
          onLeaveRoom: () => hangUp(),
        })
      } catch (err: any) {
        setError(err.message || "Connection failed.")
      }
    }

    initCall()

    return () => {
      if (billingIntervalRef.current) clearInterval(billingIntervalRef.current);
      if (zpRef.current) {
        try { zpRef.current.leaveRoom(); } catch(e) {}
      }
    }
  }, [user, profile, chatId, isVideo, isCaller])

  const toggleMic = () => {
    if (zpRef.current) {
      const newState = !micEnabled
      zpRef.current.enableMicrophone(newState)
      setMicEnabled(newState)
    }
  }

  const toggleCamera = () => {
    if (zpRef.current && isVideo) {
      const newState = !cameraEnabled
      zpRef.current.enableCamera(newState)
      setCameraEnabled(newState)
    }
  }

  const hangUp = () => {
    if (billingIntervalRef.current) clearInterval(billingIntervalRef.current);
    if (zpRef.current) {
      try {
        zpRef.current.leaveRoom()
        // Force track destruction for strict privacy
        const tracks = (window as any).localStream?.getTracks?.();
        tracks?.forEach((t: any) => t.stop());
      } catch (e) {}
    }
    router.replace("/chats")
  }

  if (error) {
    return (
      <div className="flex-1 bg-black flex flex-col items-center justify-center text-white p-10 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mb-6" />
        <h2 className="text-2xl font-black uppercase tracking-tighter mb-4">Service Error</h2>
        <p className="font-bold text-white/40 uppercase tracking-widest text-[10px] leading-relaxed mb-10">
          {error}
        </p>
        <Button onClick={hangUp} className="rounded-full bg-white text-black font-black uppercase text-[10px] h-14 px-10">Return</Button>
      </div>
    )
  }

  // Fast load check
  if (!user || !profile) return <div className="flex-1 bg-black" />;

  return (
    <div className="w-full h-[100dvh] bg-black overflow-hidden relative select-none">
      <div ref={containerRef} className="w-full h-full" />
      
      <div className="absolute top-12 left-0 right-0 z-50 flex flex-col items-center gap-3 px-6 pointer-events-none">
        <div className="bg-black/40 backdrop-blur-2xl border border-white/10 px-6 py-2.5 rounded-full flex items-center gap-4 shadow-2xl animate-in slide-in-from-top-4 duration-500">
           <div className="flex h-2 w-2 rounded-full bg-red-500 animate-pulse" />
           <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">
             {isVideo ? 'Video' : 'Voice'} Call
           </span>
           <div className="w-px h-3 bg-white/20" />
           <div className="flex items-center gap-2">
             <Coins className="w-3.5 h-3.5 text-yellow-500" />
             <span className="text-[10px] font-black text-white">{isVideo ? '150' : '70'}/min</span>
           </div>
        </div>

        {isCaller && (
          <div className="bg-white/5 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/5 shadow-lg flex items-center gap-2">
            <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Balance:</span>
            <span className="text-[10px] font-black text-yellow-400">{currentBalance} Coins</span>
          </div>
        )}
      </div>

      <div className="absolute bottom-10 left-0 right-0 z-50 px-8">
        <div className="max-w-md mx-auto bg-white/5 backdrop-blur-3xl border border-white/10 rounded-[3rem] p-4 flex items-center justify-around shadow-2xl">
          <button 
            onClick={toggleMic}
            className={cn(
              "w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-90",
              micEnabled ? "bg-white/10 text-white" : "bg-red-50 text-white"
            )}
          >
            {micEnabled ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
          </button>

          <button 
            onClick={hangUp}
            className="w-20 h-20 rounded-full bg-red-600 flex items-center justify-center shadow-[0_0_40px_rgba(220,38,38,0.4)] active:scale-95 transition-transform"
          >
            <PhoneOff className="w-8 h-8 text-white fill-current" />
          </button>

          {isVideo && (
            <button 
              onClick={toggleCamera}
              className={cn(
                "w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-90",
                cameraEnabled ? "bg-white/10 text-white" : "bg-red-50 text-white"
              )}
            >
              {cameraEnabled ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
            </button>
          )}
        </div>
        
        <div className="mt-6 flex flex-col items-center gap-2 opacity-30">
           <ShieldCheck className="w-3.5 h-3.5 text-white" />
           <p className="text-[8px] font-bold text-white uppercase tracking-[0.4em]">End-to-End Encrypted</p>
        </div>
      </div>

      <div className="absolute top-1/2 left-6 -translate-y-1/2 opacity-20 pointer-events-none rotate-90 origin-left">
         <h3 className="text-5xl font-black text-white uppercase tracking-widest">{partnerName}</h3>
      </div>
    </div>
  )
}
