"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/firebase/auth/use-user"
import { Button } from "@/components/ui/button"
import { ChevronLeft, X, Coins, Trophy, CheckCircle2, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"

export default function TaskCenterPage() {
  const router = useRouter()
  const { user } = useUser()
  const { toast } = useToast()
  
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.id) return
    const fetchProfile = async () => {
      const { data } = await supabase.from('users').select('*').eq('uid', user.id).single()
      if (data) setProfile(data)
      setLoading(false)
    }
    fetchProfile()
  }, [user?.id])

  const days = [
    { day: "1st", reward: 2 },
    { day: "2nd", reward: 2 },
    { day: "3rd", reward: 5 },
    { day: "4th", reward: 2 },
    { day: "5th", reward: 2 },
    { day: "6th", reward: 2 },
    { day: "7th", reward: 10 },
  ]

  const hasCheckedInToday = useMemo(() => {
    if (!profile?.last_check_in_date) return false
    const lastDate = new Date(profile.last_check_in_date)
    const today = new Date()
    return (
      lastDate.getDate() === today.getDate() &&
      lastDate.getMonth() === today.getMonth() &&
      lastDate.getFullYear() === today.getFullYear()
    )
  }, [profile?.last_check_in_date])

  const currentStreak = profile?.check_in_streak || 0

  const handleCheckIn = async () => {
    if (!user || hasCheckedInToday) return
    const streakIndex = currentStreak % 7
    const rewardAmount = days[streakIndex].reward
    const timestamp = Date.now()
    
    // 1. Update User Record
    await supabase.from('users').update({
      last_check_in_date: new Date().toISOString(),
      check_in_streak: (profile.check_in_streak || 0) + 1
    }).eq('uid', user.id)

    // 2. Award Coins
    const { data: bal } = await supabase.from('balances').select('coins').eq('user_id', user.id).single()
    await supabase.from('balances').update({ coins: (bal?.coins || 0) + rewardAmount }).eq('user_id', user.id)

    // 3. Log History
    await supabase.from('coin_history').insert({
      user_id: user.id,
      amount: rewardAmount,
      type: 'task',
      description: 'Daily Check-in Reward',
      timestamp: timestamp
    })

    toast({ 
      title: "Check-in Successful!", 
      description: `You earned ${rewardAmount} coins. Keep it up!` 
    })
    
    // Refresh local UI state
    setProfile({ ...profile, check_in_streak: currentStreak + 1, last_check_in_date: new Date().toISOString() })
  }

  return (
    <div className="flex-1 bg-[#F8F9FA] min-h-screen pb-10 select-none">
      <header className="bg-[#00A2FF] h-32 relative px-4 pt-12">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="text-white rounded-full hover:bg-white/20">
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
          <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>
        ) : (
          <section className="bg-white p-6 rounded-3xl shadow-sm border border-black/5">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-500" />
                <h2 className="text-xs font-bold text-black uppercase tracking-widest">Daily Check-in</h2>
              </div>
              <span className="text-[10px] font-semibold text-gray-400">Total: {currentStreak} Days</span>
            </div>
            
            <div className="grid grid-cols-4 gap-3">
              {days.map((d, i) => {
                const isChecked = i < (currentStreak % 7) || (currentStreak > 0 && currentStreak % 7 === 0 && i < 7)
                const isToday = hasCheckedInToday && (i === (currentStreak - 1) % 7)
                return (
                  <div 
                    key={i} 
                    className={cn(
                      "aspect-square rounded-2xl flex flex-col items-center justify-center border-2 transition-all", 
                      (isChecked || isToday) ? "bg-green-50 border-green-200" : "bg-gray-50 border-transparent"
                    )}
                  >
                    {(isChecked || isToday) ? (
                      <CheckCircle2 className="w-6 h-6 text-green-500" />
                    ) : (
                      <>
                        <Coins className="w-5 h-5 text-yellow-500 mb-1" />
                        <span className="text-[10px] font-semibold text-gray-500">+{d.reward}</span>
                      </>
                    )}
                    <span className="text-[8px] font-medium text-gray-400 uppercase mt-1">{d.day}</span>
                  </div>
                )
              })}
            </div>
            
            <Button 
              onClick={handleCheckIn} 
              disabled={hasCheckedInToday}
              className={cn(
                "w-full mt-6 h-14 rounded-full text-white font-bold uppercase tracking-widest text-sm shadow-lg active:scale-95 transition-all", 
                hasCheckedInToday ? "bg-gray-300 shadow-none cursor-default" : "bg-[#00A2FF] shadow-blue-100"
              )}
            >
              {hasCheckedInToday ? "Already Checked-in" : "Check-in Now"}
            </Button>
          </section>
        )}
      </main>
    </div>
  )
}
