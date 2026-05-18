"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { doc, setDoc, serverTimestamp, getDoc } from "firebase/firestore"
import { ref, set as rtdbSet, push } from "firebase/database"
import { useFirestore, useUser, useDatabase } from "@/firebase"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { Heart, Loader2, Globe } from "lucide-react"
import { cn } from "@/lib/utils"

const AFRICAN_COUNTRIES = [
  "Kenya", "Tanzania", "Uganda", "Rwanda", "Burundi", "South Sudan", "Ethiopia", "Somalia", "Eritrea", "Djibouti", "South Africa", "Nigeria", "Ghana", "Egypt"
]

export default function FastOnboardingPage() {
  const [gender, setGender] = useState("")
  const [country, setCountry] = useState("")
  const [loading, setLoading] = useState(false)
  
  const { user } = useUser()
  const db = useFirestore()
  const rtdb = useDatabase()
  const router = useRouter()
  const { toast } = useToast()

  const generateRandomDOB = () => {
    const currentYear = new Date().getFullYear();
    const age = Math.floor(Math.random() * 30) + 21; 
    const year = currentYear - age;
    const month = Math.floor(Math.random() * 12);
    const day = Math.floor(Math.random() * 28) + 1;
    return new Date(year, month, day).toISOString().split('T')[0];
  }

  const generateQivoId = () => {
    const min = 1000000; 
    const max = 999999999; 
    return Math.floor(Math.random() * (max - min + 1) + min).toString();
  }

  const handleComplete = async () => {
    if (!user) return
    setLoading(true)

    try {
      const userRef = doc(db, "users", user.uid)
      const userSnap = await getDoc(userRef)
      const existingData = userSnap.data()

      const qId = existingData?.matchFlowId || generateQivoId()
      const finalName = `Guest ${qId.slice(-4)}`
      const finalDob = generateRandomDOB()

      const initialCoins = gender === 'male' ? 150 : 0
      const initialDiamonds = gender === 'female' ? 150 : 0
      const timestamp = Date.now()

      const updateData: any = {
        uid: user.uid,
        email: user.email || `anon_${user.uid}@qivo.app`,
        name: finalName,
        gender,
        dob: finalDob,
        country,
        lookingFor: "Dating",
        onboardingComplete: true,
        photoURL: `https://picsum.photos/seed/${user.uid}/400/400`,
        updatedAt: serverTimestamp(),
        createdAt: existingData?.createdAt || serverTimestamp(),
        matchFlowId: qId,
        isDeleted: false,
        isVerified: false,
        isAdmin: false,
        isCoinSeller: false,
        blocking: [],
        blockedBy: []
      }

      await setDoc(userRef, updateData, { merge: true })
      
      const balanceRef = ref(rtdb, `balances/${user.uid}`)
      await rtdbSet(balanceRef, {
        coins: initialCoins,
        diamonds: initialDiamonds,
        updatedAt: timestamp
      })

      if (initialCoins > 0) {
        await push(ref(rtdb, `coin_history/${user.uid}`), {
          amount: initialCoins,
          type: 'bonus',
          description: 'Welcome Bonus',
          timestamp: timestamp
        })
      }
      if (initialDiamonds > 0) {
        await push(ref(rtdb, `diamond_history/${user.uid}`), {
          amount: initialDiamonds,
          type: 'bonus',
          description: 'Welcome Bonus',
          timestamp: timestamp
        })
      }

      router.replace("/home")
    } catch (err: any) {
      toast({ variant: "destructive", title: "Setup Failed", description: err.message })
      setLoading(false)
    }
  }

  const canContinue = () => !!gender && !!country

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
          </div>
        </div>
      </main>

      <footer className="fixed bottom-0 inset-x-0 p-8 bg-white/80 backdrop-blur-xl border-t border-gray-50 flex gap-4 max-w-md mx-auto w-full">
        <Button 
          disabled={!canContinue() || loading}
          onClick={handleComplete}
          className="flex-1 h-16 rounded-2xl bg-[#00A2FF] hover:bg-[#0081CC] text-white font-black uppercase tracking-widest shadow-lg shadow-blue-100 active:scale-95 transition-all"
        >
          {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : "Get Started"}
        </Button>
      </footer>
    </div>
  )
}
