"use client"

import { useMemo, use, useState } from "react"
import { doc, updateDoc, arrayUnion } from "firebase/firestore"
import { useFirestore, useDoc, useUser } from "@/firebase"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { 
  ChevronLeft, 
  MessageSquare, 
  MoreHorizontal, 
  BadgeCheck,
  Ban,
  Flag,
  X,
  GraduationCap,
  Heart,
  Globe,
  Copy,
  Check,
  LayoutGrid,
  Loader2,
  Quote
} from "lucide-react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useToast } from "@/hooks/use-toast"
import { useUserPresence } from "@/hooks/use-presence"
import { errorEmitter } from "@/firebase/error-emitter"
import { FirestorePermissionError } from "@/firebase/errors"

interface UserProfile {
  uid: string
  name: string
  photoURL: string
  additionalPhotos?: string[]
  country: string
  gender: string
  dob: string
  interests?: string
  matchFlowId?: string
  isVerified?: boolean
  blocking?: string[]
  educationLevel?: string
  lookingFor?: string
}

export default function UserDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = use(params)
  const router = useRouter()
  const db = useFirestore()
  const { user: currentUser } = useUser()
  const { toast } = useToast()
  const presence = useUserPresence(userId)

  const [isPhotoOpen, setIsPhotoOpen] = useState(false)
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const userRef = useMemo(() => db ? doc(db, "users", userId) : null, [db, userId])
  const { data: profile, loading } = useDoc<UserProfile>(userRef)

  const calculateAge = (dob: string) => {
    if (!dob) return "21"
    const birthDate = new Date(dob)
    const today = new Date()
    let age = today.getFullYear() - birthDate.getFullYear()
    const m = today.getMonth() - birthDate.getMonth()
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--
    return age
  }

  const handleCopyId = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (profile?.matchFlowId) {
      navigator.clipboard.writeText(profile.matchFlowId)
      setCopied(true)
      toast({ title: "ID Copied" })
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleBlock = () => {
    if (!currentUser || !profile || !db) return
    
    const myRef = doc(db, "users", currentUser.uid)
    const targetRef = doc(db, "users", profile.uid)

    updateDoc(myRef, { 
      blocking: arrayUnion(profile.uid) 
    }).catch(async () => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({ 
        path: myRef.path, 
        operation: 'update',
        requestResourceData: { blocking: arrayUnion(profile.uid) }
      }))
    })

    updateDoc(targetRef, { 
      blockedBy: arrayUnion(currentUser.uid) 
    }).catch(async () => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({ 
        path: targetRef.path, 
        operation: 'update',
        requestResourceData: { blockedBy: arrayUnion(currentUser.uid) }
      }))
    })

    toast({ title: "User Blocked" })
    router.push("/home")
  }

  const handleReport = () => {
    toast({ title: "Report Submitted", description: "We will review this profile for any violations." })
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-white">
      <Loader2 className="w-8 h-8 animate-spin text-[#00A2FF]" />
    </div>
  )

  if (!profile) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-white p-8 text-center space-y-4">
      <div className="bg-gray-100 p-6 rounded-full">
        <Ban className="w-10 h-10 text-gray-400" />
      </div>
      <h2 className="text-xl font-bold text-black">Profile Not Found</h2>
      <Button onClick={() => router.back()} variant="outline" className="rounded-full">Go Back</Button>
    </div>
  )

  const age = calculateAge(profile.dob)
  const allPhotos = Array.from(new Set([profile.photoURL, ...(profile.additionalPhotos || [])].filter(Boolean)));

  return (
    <div className="flex-1 bg-white flex flex-col min-h-screen pb-40 select-none overflow-x-hidden">
      {/* Cinematic Header Image */}
      <div className="relative h-[60vh] w-full cursor-pointer overflow-hidden" onClick={() => { setSelectedPhoto(profile.photoURL); setIsPhotoOpen(true); }}>
        <Image 
          src={profile.photoURL} 
          alt={profile.name} 
          fill 
          className="object-cover animate-in fade-in zoom-in-105 duration-1000" 
          priority 
        />
        {/* Superior Gradient Overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-white via-black/10 to-black/40" />
        
        {/* Floating Top Nav */}
        <div className="absolute top-12 inset-x-0 px-6 flex justify-between items-center z-20" onClick={(e) => e.stopPropagation()}>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => router.back()} 
            className="rounded-full bg-black/20 backdrop-blur-xl text-white w-12 h-12 border border-white/20 shadow-xl active:scale-90 transition-all"
          >
            <ChevronLeft className="w-7 h-7" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="rounded-full bg-black/20 backdrop-blur-xl text-white w-12 h-12 border border-white/20 shadow-xl active:scale-90 transition-all"
              >
                <MoreHorizontal className="w-7 h-7" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-[2rem] min-w-[180px] p-2 border-none shadow-2xl animate-in slide-in-from-top-2">
              <DropdownMenuItem onClick={handleBlock} className="rounded-2xl h-12 text-red-500 font-bold gap-3 focus:bg-red-50 focus:text-red-600 transition-colors px-4">
                <Ban className="w-5 h-5" /> Block User
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleReport} className="rounded-2xl h-12 font-bold gap-3 focus:bg-gray-50 transition-colors px-4">
                <Flag className="w-5 h-5 text-gray-400" /> Report
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Presence Badge (Floating) */}
        {presence?.state === 'online' && (
          <div className="absolute bottom-10 left-8 bg-green-500/90 backdrop-blur-md text-white px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] shadow-xl flex items-center gap-2 animate-in slide-in-from-left-6 duration-700">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
            Online
          </div>
        )}
      </div>

      {/* Profile Content Container */}
      <div className="relative z-10 bg-white px-8 -mt-10 rounded-t-[3rem] pt-10 space-y-10 shadow-[0_-20px_40px_rgba(0,0,0,0.05)]">
        {/* Name & Basic Info Section */}
        <div className="space-y-5">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-4xl font-black text-black tracking-tighter leading-none">{profile.name}</h1>
              {profile.isVerified && (
                <div className="bg-[#00A2FF]/10 p-1.5 rounded-full">
                  <BadgeCheck className="w-6 h-6 text-[#00A2FF] fill-white" />
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-gray-400">
              <Globe className="w-3 h-3" />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em]">{profile.country || "GLOBAL CITIZEN"}</span>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-black text-white px-5 py-2 rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg flex items-center gap-2">
              <span className="opacity-60">{profile.gender === 'female' ? '♀' : '♂'}</span>
              <span>{age} Years</span>
            </div>
            <button 
              onClick={handleCopyId}
              className="bg-blue-50 text-[#00A2FF] px-5 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-blue-100 flex items-center gap-2 active:scale-95 transition-all shadow-sm group"
            >
              ID: {profile.matchFlowId || "---"}
              {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 text-[#00A2FF] opacity-40 group-hover:opacity-100 transition-opacity" />}
            </button>
          </div>
        </div>

        {/* Gallery Grid */}
        {allPhotos.length > 1 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2 text-gray-900">
                <LayoutGrid className="w-4 h-4 text-[#00A2FF]" />
                <span className="text-[11px] font-black uppercase tracking-[0.2em]">Visual Gallery</span>
              </div>
              <span className="text-[9px] font-bold text-gray-300 uppercase">{allPhotos.length} Photos</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {allPhotos.map((url, i) => (
                <div 
                  key={url} 
                  className="relative aspect-square rounded-[1.2rem] overflow-hidden cursor-pointer active:scale-95 transition-all border-2 border-gray-50 hover:border-[#00A2FF]/20"
                  onClick={() => { setSelectedPhoto(url); setIsPhotoOpen(true); }}
                >
                  <Image src={url} alt={`Photo ${i}`} fill className="object-cover" sizes="25vw" />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Interests / Bio Section */}
        {profile.interests && (
          <section className="space-y-4 animate-in fade-in duration-700 delay-300">
             <div className="flex items-center gap-2 text-gray-400">
                <Quote className="w-4 h-4 text-blue-100 fill-blue-50 rotate-180" />
                <span className="text-[11px] font-black uppercase tracking-[0.2em]">Bio & Interests</span>
             </div>
             <div className="bg-gray-50/50 p-6 rounded-[2.5rem] border border-gray-100/50 relative overflow-hidden">
                <p className="text-sm font-medium text-gray-700 leading-relaxed italic relative z-10">
                  "{profile.interests}"
                </p>
                <div className="absolute -bottom-6 -right-6 opacity-[0.03] scale-150 rotate-[-15deg]">
                   <Heart className="w-32 h-32 text-black fill-current" />
                </div>
             </div>
          </section>
        )}

        {/* Detailed Attributes Grid */}
        <div className="grid grid-cols-1 gap-4 pb-20">
          <DetailItem 
            icon={Globe} 
            label="Location" 
            value={profile.country || "Not specified"} 
            color="bg-emerald-50 text-emerald-600"
          />
          <DetailItem 
            icon={GraduationCap} 
            label="Education" 
            value={profile.educationLevel || "Not specified"} 
            color="bg-purple-50 text-purple-600"
          />
          <DetailItem 
            icon={Heart} 
            label="Intentions" 
            value={profile.lookingFor || "Exploring"} 
            color="bg-rose-50 text-rose-600"
          />
        </div>
      </div>

      {/* Full Screen Photo Viewer */}
      {isPhotoOpen && selectedPhoto && (
        <div 
          className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-3xl flex items-center justify-center animate-in fade-in duration-500"
          onClick={() => setIsPhotoOpen(false)}
        >
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={(e) => { e.stopPropagation(); setIsPhotoOpen(false); }}
            className="absolute top-12 right-6 rounded-full bg-white/10 backdrop-blur-xl text-white w-14 h-14 z-[110] border border-white/20 active:scale-75 transition-transform"
          >
            <X className="w-8 h-8 stroke-[3]" />
          </Button>
          <div className="relative w-full h-full p-4 flex items-center justify-center pointer-events-none">
            <Image 
              src={selectedPhoto} 
              alt="Full screen" 
              fill 
              className="object-contain pointer-events-auto animate-in zoom-in-95 duration-300"
              priority
            />
          </div>
        </div>
      )}

      {/* Fixed Bottom Action */}
      <div className="fixed bottom-0 inset-x-0 p-8 bg-gradient-to-t from-white via-white/95 to-transparent z-50">
        <Button 
          className="w-full h-20 rounded-[2.5rem] bg-[#00A2FF] hover:bg-[#0081CC] text-white text-base font-black flex items-center justify-center gap-4 shadow-[0_20px_50px_rgba(0,162,255,0.4)] uppercase tracking-[0.2em] active:scale-95 transition-all group overflow-hidden relative"
          onClick={() => router.push(`/chats?startWith=${profile.uid}`)}
        >
          <div className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
          <MessageSquare className="w-6 h-6 fill-white" />
          Send Message
        </Button>
      </div>
    </div>
  )
}

function DetailItem({ icon: Icon, label, value, color }: { icon: any, label: string, value: string, color: string }) {
  return (
    <div className="flex items-center gap-5 bg-white p-5 rounded-[2.2rem] border border-gray-100 shadow-[0_10px_30px_rgba(0,0,0,0.02)] active:scale-[0.98] transition-transform">
      <div className={cn("w-12 h-12 rounded-[1.2rem] flex items-center justify-center shadow-inner shrink-0", color)}>
        <Icon className="w-6 h-6" />
      </div>
      <div className="min-w-0">
        <p className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] mb-0.5">{label}</p>
        <p className="text-sm font-bold text-black truncate">{value}</p>
      </div>
    </div>
  )
}
