
"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/firebase/auth/use-user"
import { Button } from "@/components/ui/button"
import { ChevronLeft, X, Coins, Trophy, CheckCircle2, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { dailyCheckInAction } from "@/app/actions/matchflow-actions"

export default function TaskCenterPage() {
  const router = useRouter()
  const { user } = useUser()
  const { toast } = useToast()
  
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)

  const days = [
    { day: "1st", reward: 2 },
    { day: "2nd", reward: 2 },
    { day: "3rd", reward: 5 },
    { day: "4th", reward: 2 },
    { day: "5th", reward: 2 },
    { day: "6th", reward: 2 },
    { day: "7th", reward: 10 },
  ]

  useEffect(() => {
    if (!user?.id) return
    const fetchProfile = async () => {
      const { data } = await supabase.from('users').select('*').eq('uid', user.id).single()
      if (data) setProfile(data)
      setLoading(false)
    }
    fetchProfile()

    const channel = supabase.channel(`task-user-live:${user.id}`)
      .on('postgres_changes', { event: 'UPDATE', table: 'users', filter: `uid=eq.${user.id}` }, (payload) => {
        setProfile(payload.new)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user?.id])

  // Robust "Today" check using local date strings
  const hasCheckedInToday = useMemo(() => {
    if (!profile?.last_check_in_date) return false
    const lastDate = new Date(profile.last_check_in_date).toDateString();
    const today = new Date().toDateString();
    return lastDate === today;
  }, [profile?.last_check_in_date])

  const currentStreak = profile?.check_in_streak || 0

  const handleCheckIn = async () => {
    if (!user || hasCheckedInToday || isProcessing) return
    setIsProcessing(true)
    
    try {
      const res = await dailyCheckInAction(user.id);
      if (res.success) {
        toast({ 
          title: "Check-in Successful!", 
          description: `You earned ${res.amount} coins. Streak updated!` 
        })
        // Optimistically lock the UI
        setProfile((prev: any) => ({ ...prev, last_check_in_date: new Date().toISOString() }))
      } else {
        toast({ variant: "destructive", title: "Claim Error", description: res.error || "Please try again later." })
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Task Failed", description: "Connection interrupted." })
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="flex-1 bg-[#F8F9FA] min-h-screen pb-10 select-none animate-in fade-in duration-300">
      <header className="bg-[#00A2FF] h-32 relative px-4 pt-12">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="text-white rounded-full hover:bg-white/10">
            <ChevronLeft className="w-6 h-6" />
          </Button>
          <h1 className="text-xl font-bold text-white tracking-tight uppercase">Task Center</h1>
          <Button variant="ghost" size="icon" onClick={() => router.push('/home')} className="text-white rounded-full hover:bg-white/20">
            <X className="w-6 h-6" />
          </Button>
        </div>
      </header>

      <main className="mt-8 px-4 space-y-6">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#00A2FF]" /></div>
        ) : (
          <section className="bg-white p-6 rounded-[2rem] shadow-xl border border-black/5">
            <div className="flex items-center justify-between mb-6 px-1">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-yellow-50 rounded-lg flex items-center justify-center">
                  <Trophy className="w-4 h-4 text-yellow-500" />
                </div>
                <h2 className="text-xs font-black text-black uppercase tracking-widest">Daily Rewards</h2>
              </div>
              <span className="text-[10px] font-black text-[#00A2FF] uppercase tracking-widest bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
                Streak: {currentStreak}
              </span>
            </div>
            
            <div className="grid grid-cols-4 gap-3">
              {days.map((d, i) => {
                const dayNumber = i + 1
                // Logic to highlight days based on current cycle completion
                const currentCycleDay = (currentStreak % 7) || (currentStreak > 0 ? 7 : 0);
                
                // If they've already checked in today, dayNumber <= currentCycleDay is marked done.
                // If they haven't checked in yet today, only days strictly less than currentCycleDay + 1 are done.
                const isCollected = hasCheckedInToday 
                  ? dayNumber <= currentCycleDay
                  : dayNumber <= (currentStreak % 7);
                
                return (
                  <div 
                    key={i} 
                    className={cn(
                      "aspect-square rounded-2xl flex flex-col items-center justify-center border-2 transition-all duration-500", 
                      isCollected ? "bg-green-50 border-green-200" : "bg-gray-50 border-transparent shadow-inner"
                    )}
                  >
                    {isCollected ? (
                      <CheckCircle2 className="w-6 h-6 text-green-500 animate-in zoom-in" />
                    ) : (
                      <>
                        <Coins className="w-5 h-5 text-yellow-500 mb-1" />
                        <span className="text-[10px] font-black text-gray-500">+{d.reward}</span>
                      </>
                    )}
                    <span className="text-[8px] font-black text-gray-400 uppercase mt-1 tracking-tighter">{d.day}</span>
                  </div>
                )
              })}
            </div>
            
            <Button 
              onClick={handleCheckIn} 
              disabled={hasCheckedInToday || isProcessing}
              className={cn(
                "w-full mt-8 h-16 rounded-full text-white font-black uppercase tracking-widest text-sm shadow-xl active:scale-95 transition-all", 
                hasCheckedInToday ? "bg-gray-100 text-gray-300 shadow-none cursor-default" : "bg-[#00A2FF] shadow-blue-100"
              )}
            >
              {isProcessing ? <Loader2 className="animate-spin" /> : hasCheckedInToday ? "Already Claimed" : "Collect Reward"}
            </Button>
          </section>
        )}

        <section className="bg-white p-6 rounded-[2rem] shadow-sm border border-black/5 space-y-4">
          <h2 className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Identity Bonus</h2>
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-black/5">
             <div className="flex items-center gap-3">
               <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-blue-500 shadow-sm"><Trophy className="w-5 h-5" /></div>
               <div><p className="text-xs font-black uppercase tracking-tight">Trust Badge</p><p className="text-[9px] text-gray-400 font-medium">Verify your face for extra trust</p></div>
             </div>
             <Button size="sm" onClick={() => router.push('/verify-identity')} className="rounded-full bg-[#00A2FF] text-[9px] font-black h-8 shadow-lg shadow-blue-100 px-4">GO</Button>
          </div>
        </section>
      </main>
    </div>
  )
}
