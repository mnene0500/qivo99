"use client"

import { use, useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ChevronLeft, MessageSquare, MoreHorizontal, BadgeCheck, Ban, Flag, MapPin, Quote, Globe, GraduationCap, Heart, Loader2, Copy, Check } from "lucide-react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useUser } from "@/firebase/auth/use-user"
import { useToast } from "@/hooks/use-toast"

export default function UserDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = use(params)
  const router = useRouter()
  const { user: currentUser } = useUser()
  const { toast } = useToast()

  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [idCopied, setIdCopied] = useState(false)

  useEffect(() => {
    supabase.from('users').select('*').eq('uid', userId).single().then(({ data }) => {
      setProfile(data)
      setLoading(false)
    })
  }, [userId])

  const handleCopyId = () => {
    if (!profile?.match_flow_id) return
    navigator.clipboard.writeText(profile.match_flow_id)
    setIdCopied(true)
    toast({ title: "ID Copied" })
    setTimeout(() => setIdCopied(false), 2000)
  }

  const calculateAge = (dob: string) => {
    if (!dob) return "21"
    const birthDate = new Date(dob); const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    return age;
  }

  if (loading) return (
    <div className="fixed inset-0 bg-white flex items-center justify-center select-none z-[9999]">
       <h1 className="text-7xl font-logo font-black text-[#00A2FF] tracking-tight animate-pulse">
         QIVO
       </h1>
    </div>
  );
  if (!profile) return <div className="min-h-screen flex items-center justify-center p-8">Profile not found.</div>

  const age = calculateAge(profile.dob)
  const allPhotos = Array.from(new Set([profile.photo_url, ...(profile.additional_photos || [])].filter(Boolean)));

  return (
    <div className="flex-1 bg-white flex flex-col min-h-screen pb-32 select-none overflow-x-hidden">
      <div className="relative h-[55vh] w-full overflow-hidden">
        <Image src={profile.photo_url} alt={profile.name} fill className="object-cover" priority sizes="100vw" />
        <div className="absolute top-12 inset-x-0 px-6 flex justify-between items-center z-20">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full bg-white/10 backdrop-blur-xl text-white w-10 h-10 border border-white/20 shadow-2xl active:scale-90 transition-all"><ChevronLeft className="w-6 h-6" /></Button>
          {!profile.is_owner && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="rounded-full bg-white/10 backdrop-blur-xl text-white w-10 h-10 border border-white/20 shadow-2xl active:scale-90 transition-all"><MoreHorizontal className="w-6 h-6" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-2xl min-w-[180px] p-2 border-none shadow-2xl">
                <DropdownMenuItem className="rounded-xl h-12 text-red-500 font-bold gap-3 px-4"><Ban className="w-5 h-5" /> Block User</DropdownMenuItem>
                <DropdownMenuItem className="rounded-xl h-12 font-bold gap-3 px-4"><Flag className="w-5 h-5 text-gray-400" /> Report Profile</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <div className="relative z-10 bg-white px-6 pt-8 space-y-6 rounded-none">
        <div className="space-y-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-black tracking-tight leading-none">{profile.name}</h1>
              {profile.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-[#00A2FF] fill-blue-50" />}
            </div>
            <div className="flex items-center gap-2">
               <div className="flex items-center gap-1 bg-gray-50 px-2 py-0.5 rounded-full border border-gray-100">
                 <MapPin className="w-2.5 h-2.5 text-[#00A2FF]" />
                 <span className="text-[7px] font-black uppercase tracking-widest text-gray-400">{profile.country || "GLOBAL"}</span>
               </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="bg-black text-white px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-md flex items-center gap-2"><span>{profile.gender === 'female' ? '♀' : '♂'}</span><span>{age} Years</span></div>
            <button 
              onClick={handleCopyId}
              className="bg-gray-50 text-gray-400 px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border border-gray-100 active:scale-95 transition-all flex items-center gap-1.5"
            >
              ID: {profile.match_flow_id}
              {idCopied ? <Check className="w-2.5 h-2.5 text-green-500" /> : <Copy className="w-2.5 h-2.5" />}
            </button>
          </div>
        </div>

        {profile.interests && (
          <section className="space-y-2">
             <div className="flex items-center gap-1.5 text-gray-900"><Quote className="w-2.5 h-2.5 text-[#00A2FF] rotate-180" /><span className="text-[8px] font-black uppercase tracking-[0.2em]">Bio & Interests</span></div>
             <div className="bg-gray-50/50 p-4 rounded-xl border border-black/5 relative overflow-hidden"><p className="text-xs font-medium text-gray-600 leading-relaxed italic select-text">"{profile.interests}"</p></div>
          </section>
        )}

        {allPhotos.length > 1 && (
          <section className="space-y-2">
            <div className="flex items-center justify-between px-1"><span className="text-[8px] font-black uppercase tracking-[0.2em] text-gray-900">Visual Gallery</span><span className="text-[7px] font-bold text-gray-300 uppercase tracking-widest">{allPhotos.length} Photos</span></div>
            <div className="grid grid-cols-4 gap-2">
              {allPhotos.map((url, i) => (
                <div key={url} className="relative aspect-square rounded-lg overflow-hidden cursor-pointer border border-gray-50 shadow-sm active:scale-95 transition-all"><Image src={url} alt={`P${i}`} fill className="object-cover" sizes="20vw" /></div>
              ))}
            </div>
          </section>
        )}

        <div className="grid grid-cols-1 gap-2 pb-10">
          <DetailItem icon={Globe} label="Region" value={profile.country || "Not specified"} color="bg-emerald-50 text-emerald-600" />
          <DetailItem icon={GraduationCap} label="Academic" value={profile.education_level || "Not specified"} color="bg-purple-50 text-purple-600" />
          <DetailItem icon={Heart} label="Intentions" value={profile.looking_for || "Exploring"} color="bg-rose-50 text-rose-600" />
        </div>
      </div>

      <div className="fixed bottom-0 inset-x-0 p-6 bg-gradient-to-t from-white via-white/95 to-transparent z-50">
        <Button className="w-full h-14 rounded-xl bg-[#00A2FF] hover:bg-[#0081CC] text-white text-xs font-black flex items-center justify-center gap-2.5 shadow-xl uppercase tracking-[0.2em] active:scale-95 transition-all border-none" onClick={() => router.push(`/chats?startWith=${profile.uid}`)}><MessageSquare className="w-4 h-4 fill-white" />Send Message</Button>
      </div>
    </div>
  )
}

function DetailItem({ icon: Icon, label, value, color }: { icon: any, label: string, value: string, color: string }) {
  return (
    <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-black/[0.03] shadow-sm">
      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-inner", color)}><Icon className="w-4 h-4" /></div>
      <div className="min-w-0"><p className="text-[7px] font-black text-gray-400 uppercase tracking-[0.2em] mb-0.5">{label}</p><p className="text-[11px] font-black text-black truncate tracking-tight">{value}</p></div>
    </div>
  )
}
