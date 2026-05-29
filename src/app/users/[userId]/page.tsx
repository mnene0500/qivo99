
"use client"

import { use, useState, useEffect, useRef } from "react"
import { supabase, base64ToBlob, uploadPostPhoto } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ChevronLeft, MessageSquare, MoreHorizontal, BadgeCheck, Ban, Flag, MapPin, Quote, Globe, GraduationCap, Heart, Loader2, Copy, Check, X, Camera, Send } from "lucide-react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useUser } from "@/firebase/auth/use-user"
import { useToast } from "@/hooks/use-toast"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { reportUserAction } from "@/app/actions/matchflow-actions"

export default function UserDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = use(params)
  const router = useRouter()
  const { user: currentUser } = useUser()
  const { toast } = useToast()

  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [idCopied, setIdCopied] = useState(false)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  
  // Reporting States
  const [reportDialogOpen, setReportDialogOpen] = useState(false)
  const [reportReason, setReportReason] = useState("Inappropriate Content")
  const [reportDesc, setReportDesc] = useState("")
  const [reportProof, setReportProof] = useState<string | null>(null)
  const [isReporting, setIsReporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => setReportProof(reader.result as string)
      reader.readAsDataURL(file)
    }
  }

  const submitReport = async () => {
    if (!currentUser || !reportDesc.trim()) {
      toast({ variant: "destructive", title: "Description Required" })
      return
    }

    setIsReporting(true)
    try {
      let proofUrl = undefined
      if (reportProof) {
        const { blob } = base64ToBlob(reportProof)
        proofUrl = await uploadPostPhoto(blob, currentUser.id, 'photos')
      }

      const res = await reportUserAction({
        reporterId: currentUser.id,
        reportedId: userId,
        reason: reportReason,
        description: reportDesc,
        proofPhotoUrl: proofUrl
      })

      if (res.success) {
        toast({ title: "Report Submitted", description: "Our team will review this shortly." })
        setReportDialogOpen(false)
        setReportDesc("")
        setReportProof(null)
      } else {
        throw new Error(res.error)
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Failed", description: e.message })
    } finally {
      setIsReporting(false)
    }
  }

  const handleBlock = async () => {
    if (!currentUser || !profile) return
    try {
      const myBlocking = Array.from(new Set([...(profile.blocking || []), profile.uid]))
      const theirBlockedBy = Array.from(new Set([...(profile.blocked_by || []), currentUser.id]))
      
      await Promise.all([
        supabase.from('users').update({ blocking: myBlocking }).eq('uid', currentUser.id),
        supabase.from('users').update({ blocked_by: theirBlockedBy }).eq('uid', profile.uid)
      ])
      
      toast({ title: "User Blocked" })
      router.replace('/home')
    } catch (e) {
      toast({ variant: "destructive", title: "Error" })
    }
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
         Qivo
       </h1>
    </div>
  );
  if (!profile) return <div className="min-h-screen flex items-center justify-center p-8 text-black font-bold">Profile not found.</div>

  const age = calculateAge(profile.dob)
  const allPhotos = Array.from(new Set([profile.photo_url, ...(profile.additional_photos || [])].filter(Boolean)));

  return (
    <div className="flex flex-col h-screen w-full bg-white relative overflow-hidden">
      <div className="flex-1 w-full overflow-y-auto no-scrollbar pb-40">
        <div className="relative h-[55vh] w-full overflow-hidden shrink-0">
          <Image src={profile.photo_url} alt={profile.name} fill className="object-cover cursor-pointer" priority sizes="100vw" onClick={() => setSelectedImage(profile.photo_url)} />
          <div className="absolute top-12 inset-x-0 px-6 flex justify-between items-center z-20">
            <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full bg-white/10 backdrop-blur-xl text-white w-10 h-10 border border-white/20 shadow-2xl active:scale-90 transition-all"><ChevronLeft className="w-6 h-6" /></Button>
            {!profile.is_owner && !profile.is_admin && profile.uid !== currentUser?.id && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="rounded-full bg-white/10 backdrop-blur-xl text-white w-10 h-10 border border-white/20 shadow-2xl active:scale-90 transition-all"><MoreHorizontal className="w-6 h-6" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="rounded-2xl min-w-[180px] p-2 border-none shadow-2xl">
                  <DropdownMenuItem onClick={handleBlock} className="rounded-xl h-12 text-red-500 font-bold gap-3 px-4"><Ban className="w-5 h-5" /> Block User</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setReportDialogOpen(true)} className="rounded-xl h-12 font-bold gap-3 px-4 text-gray-400"><Flag className="w-5 h-5" /> Report Profile</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        <div className="px-6 pt-8 space-y-6">
          <div className="space-y-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-black tracking-tight leading-none">{profile.name}</h1>
                {profile.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-[#00A2FF] fill-blue-50" />}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-gray-50 px-2 py-0.5 rounded-full border border-gray-100">
                  <MapPin className="w-2.5 h-2.5 text-[#00A2FF]" />
                  <span className="text-[10px] font-bold text-gray-400">{profile.country || "Global"}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="bg-black text-white px-3 py-1 rounded-lg text-[10px] font-black tracking-tight shadow-md flex items-center gap-2"><span>{profile.gender === 'female' ? '♀' : '♂'}</span><span>{age} Years</span></div>
              <button 
                onClick={handleCopyId}
                className="bg-gray-50 text-gray-500 px-3 py-1 rounded-lg text-[10px] font-bold border border-gray-100 active:scale-95 transition-all flex items-center gap-1.5"
              >
                ID: {profile.match_flow_id}
                {idCopied ? <Check className="w-2.5 h-2.5 text-green-500" /> : <Copy className="w-2.5 h-2.5" />}
              </button>
            </div>
          </div>

          {profile.interests && (
            <section className="space-y-2">
              <div className="flex items-center gap-1.5 text-gray-900"><Quote className="w-3 h-3 text-[#00A2FF] rotate-180" /><span className="text-[10px] font-bold text-gray-400">Bio & Interests</span></div>
              <div className="bg-gray-50/50 p-4 rounded-xl border border-black/5 relative overflow-hidden"><p className="text-xs font-medium text-gray-600 leading-relaxed italic select-text">"{profile.interests}"</p></div>
            </section>
          )}

          {allPhotos.length > 1 && (
            <section className="space-y-2">
              <div className="flex items-center justify-between px-1"><span className="text-[10px] font-bold text-gray-400">Visual Gallery</span><span className="text-[9px] font-bold text-gray-300">{allPhotos.length} Photos</span></div>
              <div className="grid grid-cols-4 gap-2">
                {allPhotos.map((url, i) => (
                  <div key={url} className="relative aspect-square rounded-lg overflow-hidden cursor-pointer border border-gray-50 shadow-sm active:scale-95 transition-all" onClick={() => setSelectedImage(url)}>
                    <Image src={url} alt={`P${i}`} fill className="object-cover" sizes="20vw" />
                  </div>
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
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-6 bg-white/90 backdrop-blur-xl border-t border-black/5 z-[60] pb-[env(safe-area-inset-bottom,24px)]">
        <Button 
          className="w-full h-14 rounded-2xl bg-[#00A2FF] hover:bg-[#0081CC] text-white text-sm font-bold flex items-center justify-center gap-2.5 shadow-xl active:scale-95 transition-all border-none" 
          onClick={() => router.push(`/chats?startWith=${profile.uid}`)}
        >
          <MessageSquare className="w-4 h-4 fill-white" />
          Send Message
        </Button>
      </div>

      {/* Full Screen Image Viewer */}
      {selectedImage && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center animate-in fade-in duration-300" onClick={() => setSelectedImage(null)}>
          <button className="absolute top-12 right-6 w-10 h-10 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/20 active:scale-90 transition-transform">
            <X className="w-6 h-6" />
          </button>
          <div className="relative w-full h-[80vh]">
            <Image src={selectedImage} alt="Fullscreen" fill className="object-contain" sizes="100vw" />
          </div>
        </div>
      )}

      {/* REPORT DIALOG */}
      <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
        <DialogContent className="max-w-[90vw] rounded-[2.5rem] p-8 border-none overflow-hidden select-none">
          <DialogHeader className="items-center text-center space-y-4">
             <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center text-red-500 shadow-inner">
               <Flag className="w-8 h-8 fill-current" />
             </div>
             <DialogTitle className="text-xl font-black uppercase tracking-tight">Report User</DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
             <div className="space-y-2">
               <Label className="text-[10px] font-black uppercase text-gray-400 ml-1">Why are you reporting?</Label>
               <select value={reportReason} onChange={(e) => setReportReason(e.target.value)} className="w-full h-12 rounded-xl bg-gray-50 border-none px-4 font-bold text-sm outline-none">
                  <option>Inappropriate Content</option>
                  <option>Harassment</option>
                  <option>Scam/Fraud</option>
                  <option>Identity Theft</option>
                  <option>Underage User</option>
               </select>
             </div>

             <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-gray-400 ml-1">Explanation (Required)</Label>
                <Textarea placeholder="Please describe what happened..." value={reportDesc} onChange={(e) => setReportDesc(e.target.value)} className="rounded-2xl bg-gray-50 border-none min-h-[100px] p-4 text-sm font-medium" />
             </div>

             <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-gray-400 ml-1">Proof Photo (Evidence)</Label>
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="h-32 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 flex flex-col items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all overflow-hidden relative"
                >
                  {reportProof ? (
                    <Image src={reportProof} alt="Proof" fill className="object-cover" />
                  ) : (
                    <>
                      <Camera className="w-6 h-6 text-gray-300" />
                      <span className="text-[9px] font-black text-gray-400 uppercase">Tap to Upload</span>
                    </>
                  )}
                </div>
                <input type="file" hidden ref={fileInputRef} accept="image/*" onChange={handleFileChange} />
             </div>
          </div>

          <DialogFooter className="flex-col gap-3 mt-4">
             <Button onClick={submitReport} disabled={isReporting || !reportDesc.trim()} className="w-full h-14 rounded-full bg-black text-white font-black uppercase tracking-widest text-[10px] shadow-xl">
               {isReporting ? <Loader2 className="animate-spin" /> : <div className="flex items-center gap-2"><Send className="w-4 h-4" /> Submit for Review</div>}
             </Button>
             <Button variant="ghost" onClick={() => setReportDialogOpen(false)} className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DetailItem({ icon: Icon, label, value, color }: { icon: any, label: string, value: string, color: string }) {
  return (
    <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-black/[0.03] shadow-sm">
      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-inner", color)}><Icon className="w-4 h-4" /></div>
      <div className="min-w-0"><p className="text-[9px] font-bold text-gray-400 mb-0.5">{label}</p><p className="text-[11px] font-bold text-black truncate tracking-tight">{value}</p></div>
    </div>
  )
}
