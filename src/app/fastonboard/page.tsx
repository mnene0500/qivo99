
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
import { Heart, Loader2, Camera, ChevronLeft, User, MapPin, Calendar } from "lucide-react"
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
      toast({ variant: "destructive", title: "Photo Required" })
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
      <div className="flex-1 flex flex-col bg-white min-h-screen animate-in fade-in duration-300">
        <header className="px-4 h-14 flex items-center border-b shrink-0">
          <Button variant="ghost" size="icon" onClick={() => setShowPhotoStep(false)} className="rounded-full">
            <ChevronLeft className="w-5 h-5 text-black" />
          </Button>
          <span className="text-[11px] font-bold tracking-tight ml-2">Verification Photo</span>
        </header>

        <main className="flex-1 p-6 flex flex-col items-center justify-center space-y-6">
           <div className="text-center space-y-1">
             <h2 className="text-2xl font-black text-black">A Quick Photo</h2>
             <p className="text-[11px] text-gray-400 font-bold">Required for female profiles</p>
           </div>

           <div className="relative cursor-pointer" onClick={() => fileInputRef.current?.click()}>
            <Avatar className="w-48 h-48 border-none shadow-2xl overflow-hidden bg-gray-100 rounded-[2.5rem]">
              <AvatarImage src={uploadedPhoto || ""} className="object-cover" />
              <AvatarFallback className="bg-gray-50"><Camera className="w-16 h-16 text-gray-200" /></AvatarFallback>
            </Avatar>
            <div className="absolute bottom-2 right-2 bg-[#00A2FF] p-3 rounded-2xl text-white shadow-xl border-4 border-white"><Camera className="w-6 h-6" /></div>
          </div>

          <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
          <p className="text-[10px] font-bold text-gray-300 tracking-widest">Tap icon to upload</p>
        </main>

        <footer className="p-6 bg-white border-t shrink-0 pb-[env(safe-area-inset-bottom)]">
          <Button 
            disabled={!uploadedPhoto || loading}
            onClick={handleComplete}
            className="w-full h-14 rounded-2xl bg-black text-white font-bold tracking-tight shadow-xl active:scale-95 transition-all"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Start Exploring"}
          </Button>
        </footer>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-white min-h-screen relative animate-in fade-in duration-300 overflow-hidden">
      <header className="px-6 pt-10 pb-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shadow-sm">
            <Heart className="w-5 h-5 text-[#00A2FF] fill-current" />
          </div>
          <h1 className="text-2xl font-black text-black tracking-tight">Complete Profile</h1>
        </div>
      </header>

      <main className="flex-1 px-6 pt-2 pb-10 space-y-5 overflow-y-auto no-scrollbar">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-[11px] font-bold text-gray-400 ml-1 flex items-center gap-1.5"><User className="w-3.5 h-3.5"/> I am a</Label>
            <div className="grid grid-cols-2 gap-3">
              {['male', 'female'].map((g) => (
                <button
                  key={g}
                  onClick={() => setGender(g)}
                  className={cn(
                    "h-14 rounded-xl border-2 flex items-center justify-center gap-3 transition-all",
                    gender === g 
                      ? "border-[#00A2FF] bg-blue-50 text-[#00A2FF] shadow-sm" 
                      : "border-gray-50 bg-gray-50 text-gray-400"
                  )}
                >
                  <span className="text-xl">{g === 'male' ? '♂️' : '♀️'}</span>
                  <span className="text-[11px] font-bold">{g === 'male' ? 'Male' : 'Female'}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[11px] font-bold text-gray-400 ml-1 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5"/> Birth Date</Label>
              <Input type="date" max={maxDate} value={dob} onChange={(e) => setDob(e.target.value)} className="rounded-xl h-14 border-gray-50 bg-gray-50 font-bold text-sm" />
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] font-bold text-gray-400 ml-1 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5"/> Origin</Label>
              <Select onValueChange={setCountry} value={country}>
                <SelectTrigger className="rounded-xl h-14 border-gray-50 bg-gray-50 font-bold text-sm">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {AFRICAN_COUNTRIES.map((c) => (
                    <SelectItem key={c} value={c} className="font-bold">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[11px] font-bold text-gray-400 ml-1 flex items-center gap-1.5"><Heart className="w-3.5 h-3.5"/> Looking For</Label>
            <Select onValueChange={setLookingFor} value={lookingFor}>
              <SelectTrigger className="rounded-xl h-14 border-gray-50 bg-gray-50 font-bold text-sm">
                <SelectValue placeholder="What's your goal?" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {LOOKING_FOR_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt} className="font-bold">{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </main>

      <footer className="p-6 bg-white border-t shrink-0 pb-[env(safe-area-inset-bottom)]">
        <Button 
          disabled={!canContinue() || loading}
          onClick={handleComplete}
          className="w-full h-14 rounded-2xl bg-[#00A2FF] hover:bg-[#0081CC] text-white font-bold shadow-xl active:scale-95 transition-all"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (gender === 'female' ? "Next: Add Photo" : "Get Started")}
        </Button>
      </footer>
    </div>
  )
}
