
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
import { Heart, Loader2, Camera, ChevronLeft, User, MapPin, Calendar, Sparkles } from "lucide-react"
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
    
    // Step 1: If female and haven't shown photo step, show it
    if (gender === 'female' && !showPhotoStep) {
      setShowPhotoStep(true)
      return
    }

    // Step 2: If female, require the photo
    if (gender === 'female' && !uploadedPhoto) {
      toast({ variant: "destructive", title: "Photo Required" })
      return
    }

    setLoading(true)

    try {
      let finalPhotoUrl = uploadedPhoto || user.user_metadata?.avatar_url || user.user_metadata?.picture;
      
      // ASYNC UPLOAD: Crucial to do this before the DB action
      if (uploadedPhoto && uploadedPhoto.startsWith('data:image')) {
        const { blob } = base64ToBlob(uploadedPhoto);
        finalPhotoUrl = await uploadProfilePhoto(blob, user.id);
      }

      const res = await completeOnboardingAction({
        uid: user.id,
        email: user.email!,
        name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || "User",
        gender,
        dob,
        country,
        looking_for: lookingFor,
        photo_url: finalPhotoUrl || ""
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
        <header className="px-6 h-16 flex items-center border-b shrink-0 bg-white sticky top-0 z-50">
          <Button variant="ghost" size="icon" onClick={() => setShowPhotoStep(false)} className="rounded-full bg-gray-50">
            <ChevronLeft className="w-5 h-5 text-black" />
          </Button>
          <h1 className="text-sm font-black uppercase tracking-widest ml-4 text-black">Verification</h1>
        </header>

        <main className="flex-1 p-8 flex flex-col items-center justify-center space-y-10">
           <div className="text-center space-y-2">
             <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Camera className="w-8 h-8 text-[#00A2FF]" />
             </div>
             <h2 className="text-3xl font-black text-black tracking-tight">Identity Photo</h2>
             <p className="text-sm text-gray-400 font-medium px-8">Required for female profiles to ensure community safety.</p>
           </div>

           <div className="relative cursor-pointer group" onClick={() => fileInputRef.current?.click()}>
            <div className="w-56 h-56 rounded-[3.5rem] bg-gray-50 border-4 border-white shadow-2xl overflow-hidden relative transition-transform group-active:scale-95 duration-500">
              <Avatar className="w-full h-full rounded-none">
                <AvatarImage src={uploadedPhoto || ""} className="object-cover" />
                <AvatarFallback className="bg-gray-50"><Camera className="w-12 h-12 text-gray-200" /></AvatarFallback>
              </Avatar>
            </div>
            <div className="absolute -bottom-2 -right-2 bg-[#00A2FF] p-4 rounded-3xl text-white shadow-2xl border-4 border-white active:scale-90 transition-transform">
              <Camera className="w-6 h-6" />
            </div>
          </div>

          <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
          <p className="text-[10px] font-black text-gray-300 uppercase tracking-[0.3em]">Tap frame to upload</p>
        </main>

        <footer className="p-8 bg-white border-t shrink-0 pb-[env(safe-area-inset-bottom,20px)] shadow-[0_-10px_30px_rgba(0,0,0,0.02)]">
          <Button 
            disabled={!uploadedPhoto || loading}
            onClick={handleComplete}
            className="w-full h-16 rounded-2xl bg-black text-white font-black uppercase tracking-widest text-sm shadow-xl active:scale-95 transition-all"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Complete Profile"}
          </Button>
        </footer>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-white min-h-screen relative animate-in fade-in duration-300 overflow-hidden select-none">
      <header className="px-8 pt-12 pb-6 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center shadow-inner">
            <Heart className="w-6 h-6 text-[#00A2FF] fill-current" />
          </div>
          <div className="space-y-0.5">
            <h1 className="text-3xl font-black text-black tracking-tight leading-none">Welcome</h1>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Let's build your profile</p>
          </div>
        </div>
      </header>

      <main className="flex-1 px-8 pt-2 pb-32 space-y-8 overflow-y-auto no-scrollbar">
        <div className="space-y-6">
          <div className="space-y-3">
            <Label className="text-[11px] font-black text-gray-400 ml-1 uppercase tracking-[0.2em]">Gender Identity</Label>
            <div className="grid grid-cols-2 gap-4">
              {['male', 'female'].map((g) => (
                <button
                  key={g}
                  onClick={() => setGender(g)}
                  className={cn(
                    "h-24 rounded-[2rem] border-2 flex flex-col items-center justify-center gap-2 transition-all active:scale-95 duration-300",
                    gender === g 
                      ? "border-[#00A2FF] bg-blue-50 text-[#00A2FF] shadow-lg shadow-blue-100" 
                      : "border-gray-50 bg-gray-50 text-gray-400"
                  )}
                >
                  <span className="text-3xl">{g === 'male' ? '♂️' : '♀️'}</span>
                  <span className="text-[10px] font-black uppercase tracking-widest">{g === 'male' ? 'Male' : 'Female'}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6">
            <div className="space-y-3">
              <Label className="text-[11px] font-black text-gray-400 ml-1 uppercase tracking-[0.2em]">Date of Birth</Label>
              <div className="relative">
                 <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#00A2FF] pointer-events-none" />
                 <Input type="date" max={maxDate} value={dob} onChange={(e) => setDob(e.target.value)} className="rounded-2xl h-16 pl-12 border-gray-50 bg-gray-50 font-black text-sm transition-all focus:bg-white focus:border-[#00A2FF]" />
              </div>
            </div>
            
            <div className="space-y-3">
              <Label className="text-[11px] font-black text-gray-400 ml-1 uppercase tracking-[0.2em]">Home Country</Label>
              <div className="relative">
                 <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#00A2FF] pointer-events-none z-10" />
                 <Select onValueChange={setCountry} value={country}>
                   <SelectTrigger className="rounded-2xl h-16 pl-12 border-gray-50 bg-gray-50 font-black text-sm transition-all focus:bg-white">
                     <SelectValue placeholder="Select Origin" />
                   </SelectTrigger>
                   <SelectContent className="rounded-2xl h-64 border-none shadow-2xl">
                     {AFRICAN_COUNTRIES.map((c) => (
                       <SelectItem key={c} value={c} className="font-black text-xs uppercase py-3">{c}</SelectItem>
                     ))}
                   </SelectContent>
                 </Select>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-[11px] font-black text-gray-400 ml-1 uppercase tracking-[0.2em]">I'm looking for</Label>
            <div className="relative">
               <Sparkles className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#00A2FF] pointer-events-none z-10" />
               <Select onValueChange={setLookingFor} value={lookingFor}>
                 <SelectTrigger className="rounded-2xl h-16 pl-12 border-gray-100 bg-gray-50 font-black text-sm transition-all focus:bg-white">
                   <SelectValue placeholder="Your Goal?" />
                 </SelectTrigger>
                 <SelectContent className="rounded-2xl border-none shadow-2xl">
                   {LOOKING_FOR_OPTIONS.map((opt) => (
                     <SelectItem key={opt} value={opt} className="font-black text-xs uppercase py-3">{opt}</SelectItem>
                   ))}
                 </SelectContent>
               </Select>
            </div>
          </div>
        </div>
      </main>

      <footer className="fixed bottom-0 inset-x-0 p-8 bg-white/80 backdrop-blur-xl border-t border-gray-100 shrink-0 pb-[env(safe-area-inset-bottom,20px)] z-50">
        <Button 
          disabled={!canContinue() || loading}
          onClick={handleComplete}
          className="w-full h-16 rounded-2xl bg-[#00A2FF] hover:bg-[#0081CC] text-white font-black uppercase tracking-[0.2em] text-sm shadow-xl active:scale-95 transition-all"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (gender === 'female' ? "Add Photo" : "Get Started")}
        </Button>
      </footer>
    </div>
  )
}
