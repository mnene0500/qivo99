
"use client"

import { useState, useRef, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ChevronLeft, Coins, Trophy, Loader2, Sparkles, Info, Star } from "lucide-react"
import { useUser } from "@/firebase/auth/use-user"
import { useToast } from "@/hooks/use-toast"
import { useBalance } from "@/lib/providers/BalanceProvider"
import { playSpinGameAction } from "@/app/actions/matchflow-actions"
import { cn } from "@/lib/utils"

const STAKES = [20, 50, 100, 200, 500]
const SLOT_COUNT = 20
const SECTOR_ANGLE = 360 / SLOT_COUNT

export default function SpinToWinPage() {
  const router = useRouter()
  const { user } = useUser()
  const { toast } = useToast()
  const { coins } = useBalance()
  
  const [selectedStake, setSelectedStake] = useState(20)
  const [isSpinning, setIsSpinning] = useState(false)
  const [rotation, setRotation] = useState(0)
  const [lastWin, setLastWin] = useState<number | null>(null)

  // Dynamic Visual Prizes based on Stake
  const currentPrizes = useMemo(() => {
    if (selectedStake === 20) return [0, 5, 10, 0, 20, 0, 50, 5, 0, 10, 20, 0, 5, 0, 30, 0, 10, 50, 0, 15];
    if (selectedStake <= 100) return [0, 20, 50, 0, 100, 0, 200, 20, 0, 50, 100, 0, 20, 0, 150, 0, 50, 200, 0, 80];
    return [0, 100, 200, 0, 500, 0, 1000, 100, 0, 200, 500, 0, 100, 0, 750, 0, 200, 1000, 0, 400];
  }, [selectedStake]);

  const handleSpin = async () => {
    if (!user || isSpinning) return
    if (coins < selectedStake) {
      toast({ variant: "destructive", title: "Insufficient Coins" })
      return
    }

    setIsSpinning(true)
    setLastWin(null)

    try {
      const res = await playSpinGameAction(user.id, selectedStake)
      
      if (res.success && res.index !== undefined) {
        const fullSpins = 8 + Math.floor(Math.random() * 4)
        const targetAngle = fullSpins * 360 + (res.index * SECTOR_ANGLE)
        const newRotation = rotation + targetAngle
        setRotation(newRotation)

        setTimeout(() => {
          setIsSpinning(false)
          setLastWin(res.winAmount)
          if (res.winAmount > 0) {
            toast({ title: `You Won ${res.winAmount} Coins!`, description: "Winning added to your wallet." })
          } else {
            toast({ title: "No Win", description: "Better luck next spin!" })
          }
        }, 5500)
      } else {
        throw new Error(res.error)
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message })
      setIsSpinning(false)
    }
  }

  return (
    <div className="flex-1 bg-[#0A0A0A] min-h-screen flex flex-col select-none overflow-hidden relative">
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,#4F46E5_0%,transparent_70%)]" />
      </div>

      <header className="px-4 h-16 flex items-center justify-between sticky top-0 z-[60] bg-black/40 backdrop-blur-md">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full text-white/60 hover:text-white"><ChevronLeft className="w-6 h-6" /></Button>
        <div className="flex items-center gap-2 bg-black/50 px-4 py-1.5 rounded-full border border-white/10">
          <Coins className="w-3.5 h-3.5 text-yellow-500 fill-current" />
          <span className="text-xs font-black text-white">{coins}</span>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6 space-y-10 relative z-10">
        <div className="text-center space-y-1">
          <h1 className="text-4xl font-black text-white tracking-tighter italic uppercase">Spin <span className="text-amber-500">To Win</span></h1>
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.3em]">20 High-Reward Slots</p>
        </div>

        <div className="relative w-80 h-80 flex items-center justify-center">
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-50 filter drop-shadow-xl">
            <div className="w-8 h-10 bg-amber-500" style={{ clipPath: 'polygon(50% 100%, 0 0, 100% 0)' }} />
          </div>

          <div 
            className="w-full h-full rounded-full border-[8px] border-amber-900/50 shadow-[0_0_80px_rgba(245,158,11,0.15)] bg-black overflow-hidden relative"
          >
            <svg 
              viewBox="0 0 100 100" 
              className="w-full h-full transition-transform duration-[5000ms] cubic-bezier(0.1, 0, 0.1, 1)"
              style={{ transform: `rotate(-${rotation}deg)` }}
            >
              {currentPrizes.map((prize, i) => {
                const angle = i * SECTOR_ANGLE
                return (
                  <g key={i} transform={`rotate(${angle} 50 50)`}>
                    <path d={`M 50 50 L 50 0 A 50 50 0 0 1 ${50 + 50 * Math.sin((SECTOR_ANGLE * Math.PI) / 180)} ${50 - 50 * Math.cos((SECTOR_ANGLE * Math.PI) / 180)} Z`} fill={i % 2 === 0 ? '#111' : '#1a1a1a'} stroke="#222" strokeWidth="0.1" />
                    <text x="50" y="15" transform={`rotate(${SECTOR_ANGLE / 2} 50 15)`} fill={prize > 0 ? (prize >= 500 ? '#F59E0B' : '#888') : '#333'} className="text-[2.5px] font-black uppercase tracking-tighter" textAnchor="middle">{prize === 0 ? 'MISS' : prize}</text>
                  </g>
                )
              })}
            </svg>
            <div className="absolute inset-[42%] bg-amber-600 rounded-full border-2 border-amber-900 shadow-inner flex items-center justify-center z-20">
              <Star className="w-4 h-4 text-white fill-current" />
            </div>
          </div>
        </div>

        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-3">
             <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest text-center">Set Your Stake</p>
             <div className="flex justify-between gap-1.5">
               {STAKES.map((stake) => (
                 <button key={stake} disabled={isSpinning} onClick={() => { setSelectedStake(stake); setLastWin(null); }} className={cn("flex-1 h-11 rounded-xl border font-black text-[10px] transition-all", selectedStake === stake ? "bg-amber-500 border-amber-400 text-black shadow-lg" : "bg-white/5 border-white/5 text-white/40")}>{stake}</button>
               ))}
             </div>
          </div>
          <Button onClick={handleSpin} disabled={isSpinning} className={cn("w-full h-18 py-7 rounded-[2rem] text-sm font-black uppercase tracking-[0.2em] shadow-2xl active:scale-95 transition-all", isSpinning ? "bg-white/10 text-gray-500" : "bg-white text-black hover:bg-amber-500")}>
            {isSpinning ? <Loader2 className="w-6 h-6 animate-spin" /> : "Stake & Spin"}
          </Button>
        </div>
      </main>

      {lastWin !== null && lastWin > 0 && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md p-10 animate-in fade-in zoom-in duration-300" onClick={() => setLastWin(null)}>
           <div className="bg-amber-500 p-10 rounded-[3rem] text-center space-y-6 shadow-[0_0_100px_rgba(245,158,11,0.5)] border-4 border-white/20">
             <Trophy className="w-20 h-20 text-black mx-auto animate-bounce" />
             <div className="space-y-1">
               <h3 className="text-4xl font-black text-black tracking-tighter uppercase italic">Big Win!</h3>
               <div className="flex items-center justify-center gap-3 text-white bg-black px-6 py-2 rounded-full mt-4"><Coins className="w-6 h-6 fill-current text-yellow-500" /><span className="text-3xl font-black">+{lastWin}</span></div>
             </div>
           </div>
        </div>
      )}
    </div>
  )
}
