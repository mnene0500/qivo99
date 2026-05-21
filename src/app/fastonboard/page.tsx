"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/firebase/auth/use-user"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { Heart, Loader2, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"

const AFRICAN_COUNTRIES = [
  "Kenya", "Tanzania", "Uganda", "Rwanda", "Burundi", "South Sudan", "Ethiopia", "Somalia", "Eritrea", "Djibouti", "South Africa", "Nigeria", "Ghana", "Egypt"
]

const LOOKING_FOR_OPTIONS = [
  "Serious partner", "Casual friendship", "Networking", "Dating", "Travel buddy"
]

export default function FastOnboardingPage() {
  const [gender, setGender] = useState("")
  const [country, setCountry] = useState("")
  const [lookingFor, setLookingFor] = useState("")
  const [loading, setLoading] = useState(false)
  
  const { user } = useUser()
  const router = useRouter()
  const { toast } = useToast()

  const handleClearCache = () => {
    localStorage.clear()
    sessionStorage.clear()
    toast({ title: "Cache Cleared" })
    window.location.reload()
  }

  const handleComplete = async () => {
    if (!user) return
    setLoading(true)

    try {
      const initialCoins = gender === 'male' ? 150 : 0
      const initialDiamonds = gender === 'female' ? 150 : 0
      const timestamp = Date.now()

      // 1. Update Profile
      await supabase.from('users').update({
        gender,
        country,
        looking_for: lookingFor,
        onboarding_complete: true,
      }).eq('uid', user.id)
      
      // 2. Setup Initial Balance
      await supabase.from('balances').upsert({
        user_id: user.id,
        coins: initialCoins,
        diamonds: initialDiamonds
      })

      if (initialCoins > 0) {
        await supabase.from('coin_history').insert({
          user_id: user.id,
          amount: initialCoins,
          type: 'bonus',
          description: 'Welcome Bonus',
          timestamp: timestamp
        })
      }
      
      toast({ title: "Setup Complete!" })
      setTimeout(() => {
        router.push("/home")
      }, 500)
      
    } catch (err: any) {
      toast({ variant: "destructive", title: "Setup Failed", description: err.message })
      setLoading(false)
    }
  }

  const canContinue = () => !!gender && !!country && !!lookingFor

  return (
    <div className="flex-1 flex flex-col bg-white min-h-screen">
      <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-blue-50 to-white -z-10" />
      
      <header className="px-6 pt-12 pb-4 flex flex-col items-center">
        <div className="w-14 h-14 bg-white rounded-2xl shadow-xl flex items-center justify-center mb-6">
          <Heart className="w-8 h-8 text-[#00A2FF] fill-current" />
        </div>
        <h1 className="text-2xl font-black text-black tracking-tight mt-4 text-center">
          Instant Setup
        </h1>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
          Complete your profile
        </p>
      </header>

      <main className="flex-1 px-8 pt-8 pb-20 max-w-md mx-auto w-full space-y-8">
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-gray-400 ml-1">Your Gender</Label>
              <div className="grid grid-cols-2 gap-4">
                {['male', 'female'].map((g) => (
                  <button
                    key={g}
                    onClick={() => setGender(g)}
                    className={cn(
                      "h-24 rounded-2xl border-2 flex flex-col items-center justify-center gap-2 transition-all",
                      gender === g 
                        ? "border-[#00A2FF] bg-blue-50 text-[#00A2FF] shadow-sm" 
                        : "border-gray-50 bg-gray-50 text-gray-400"
                    )}
                  >
                    <span className="text-2xl">{g === 'male' ? '♂️' : '♀️'}</span>
                    <span className="text-[10px] font-bold uppercase tracking-widest">{g}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-gray-400 ml-1">Your Country</Label>
              <Select onValueChange={setCountry} value={country}>
                <SelectTrigger className="rounded-2xl h-14 border-gray-100 bg-gray-50 text-lg font-bold">
                  <SelectValue placeholder="Select Country" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl h-64">
                  {AFRICAN_COUNTRIES.map((c) => (
                    <SelectItem key={c} value={c} className="font-bold">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-gray-400 ml-1">Looking For</Label>
              <Select onValueChange={setLookingFor} value={lookingFor}>
                <SelectTrigger className="rounded-2xl h-14 border-gray-100 bg-gray-50 text-lg font-bold">
                  <SelectValue placeholder="What are you looking for?" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl">
                  {LOOKING_FOR_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt} className="font-bold">{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="pt-10 flex justify-center">
             <Button variant="ghost" size="sm" onClick={handleClearCache} className="text-[9px] font-bold text-gray-300 uppercase tracking-[0.2em] gap-2 hover:bg-transparent">
               <RefreshCw className="w-3 h-3" /> Clear Cache & Reload
             </Button>
          </div>
        </div>
      </main>

      <footer className="fixed bottom-0 inset-x-0 p-8 bg-white/80 backdrop-blur-xl border-t border-gray-50 flex gap-4 max-w-md mx-auto w-full">
        <Button 
          disabled={!canContinue() || loading}
          onClick={handleComplete}
          className="flex-1 h-16 rounded-2xl bg-[#00A2FF] hover:bg-[#0081CC] text-white font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all"
        >
          {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : "Get Started"}
        </Button>
      </footer>
    </div>
  )
}
