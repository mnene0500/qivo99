"use client"

import { useState, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import { base64ToBlob, uploadProfilePhoto } from "@/lib/supabase"
import { useUser } from "@/firebase/auth/use-user"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { Heart, Loader2, RefreshCw, Camera, ChevronLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { completeOnboardingAction } from "@/app/actions/matchflow-actions"

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
  const [dob, setDob] = useState("")
  const [loading, setLoading] = useState(false)
  const [showPhotoStep, setShowPhotoStep] = useState(false)
  const [uploadedPhoto, setUploadedPhoto] = useState<string | null>(null)
  
  const { user } = useUser()
  const router = useRouter()
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const maxDate = useMemo(() => {
    const d = new Date()
    d.setFullYear(d.getFullYear() - 18)
    return d.toISOString().split('T')[0]
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => setUploadedPhoto(reader.result as string)
      reader.readAsDataURL(file)
    }
  }

  const handleComplete = async () => {
    if (!user) return
    
    if (gender === 'female' && !showPhotoStep) {
      setShowPhotoStep(true)
      return
    }

    if (gender === 'female' && !uploadedPhoto) {
      toast({ variant: "destructive", title: "Photo Required", description: "Female users must upload a profile photo." })
      return
    }

    setLoading(true)

    try {
      let finalPhotoUrl = uploadedPhoto;
      
      if (uploadedPhoto && uploadedPhoto.startsWith('data:image')) {
        const { blob } = base64ToBlob(uploadedPhoto);
        finalPhotoUrl = await uploadProfilePhoto(blob, user.id);
      } else {
        finalPhotoUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture;
      }

      const res = await completeOnboardingAction({
        uid: user.id,
        email: user.email!,
        name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || "User",
        gender,
        dob,
        country,
        looking_for: lookingFor,
        photo_url: finalPhotoUrl
      });

      if (res.success) {
        toast({ title: "Setup Complete!", description: res.bonus ? `You received ${res.bonus} welcome coins!` : "Welcome to QIVO!" })
        router.replace("/home");
      } else {
        throw new Error(res.error);
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Setup Failed", description: err.message })
      setLoading(false)
    }
  }

  const canContinue = () => !!gender && !!country && !!lookingFor && !!dob

  if (showPhotoStep) {
    return (
      <div className="flex-1 flex flex-col bg-white min-h-screen">
        <header className="px-6 h-16 flex items-center border-b">
          <Button variant="ghost" size="icon" onClick={() => setShowPhotoStep(false)} className="rounded-full">
            <ChevronLeft className="w-6 h-6 text-black" />
          </Button>
          <h1 className="text-sm font-bold text-black uppercase tracking-widest ml-2">Profile Photo</h1>
        </header>

        <main className="flex-1 p-8 flex flex-col items-center justify-center space-y-8">
           <div className="text-center space-y-2">
             <h2 className="text-2xl font-black text-black tracking-tight">One last step!</h2>
             <p className="text-xs text-gray-400 font-bold uppercase tracking-widest leading-relaxed">
               Female users are required to upload a clear profile photo to proceed.
             </p>
           </div>

           <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
            <Avatar className="w-48 h-48 border-4 border-gray-50 shadow-2xl overflow-hidden bg-gray-100 rounded-[3rem]">
              <AvatarImage src={uploadedPhoto || ""} className="object-cover" />
              <AvatarFallback className="bg-gray-100"><Camera className="w-16 h-16 text-gray-200" /></AvatarFallback>
            </Avatar>
            <div className="absolute bottom-2 right-2 bg-[#00A2FF] p-4 rounded-3xl text-white shadow-xl border-4 border-white"><Camera className="w-6 h-6" /></div>
          </div>

          <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
          
          <p className="text-[10px] font-black text-gray-300 uppercase tracking-[0.3em]">Tap to upload</p>
        </main>

        <footer className="p-8 bg-white border-t">
          <Button 
            disabled={!uploadedPhoto || loading}
            onClick={handleComplete}
            className="w-full h-16 rounded-[2rem] bg-black text-white font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all"
          >
            {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : "Finish & Proceed"}
          </Button>
        </footer>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-white min-h-screen relative">
      <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-blue-50 to-white -z-10" />
      
      <header className="px-6 pt-12 pb-4 flex flex-col items-center">
        <div className="w-14 h-14 bg-white rounded-2xl shadow-xl flex items-center justify-center mb-6">
          <Heart className="w-8 h-8 text-[#00A2FF] fill-current" />
        </div>
        <h1 className="text-2xl font-black text-black tracking-tight mt-4 text-center">
          Instant Setup
        </h1>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
          Complete your profile (18+)
        </p>
      </header>

      <main className="flex-1 px-8 pt-8 pb-20 max-w-md mx-auto w-full space-y-8">
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
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
              <Label className="text-[10px] font-black uppercase text-gray-400 ml-1">Date of Birth</Label>
              <Input type="date" max={maxDate} value={dob} onChange={(e) => setDob(e.target.value)} className="rounded-2xl h-14 border-gray-100 bg-gray-50 text-lg font-bold" />
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
        </div>
      </main>

      <footer className="fixed bottom-0 inset-x-0 p-8 bg-white/80 backdrop-blur-xl border-t border-gray-50 flex gap-4 max-w-md mx-auto w-full">
        <Button 
          disabled={!canContinue() || loading}
          onClick={handleComplete}
          className="flex-1 h-16 rounded-2xl bg-[#00A2FF] hover:bg-[#0081CC] text-white font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all"
        >
          {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : (gender === 'female' ? "Continue to Photo" : "Get Started")}
        </Button>
      </footer>
    </div>
  )
}