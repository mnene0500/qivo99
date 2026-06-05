"use client"

import { use, useState, useEffect, useRef, useCallback } from "react"
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
    setIdCopied(true); toast({ title: "ID Copied" }); setTimeout(() => setIdCopied(false), 2000)
  }

  const submitReport = async () => {
    if (!currentUser || !reportDesc.trim()) return
    setIsReporting(true)
    try {
      let proofUrl = undefined
      if (reportProof) {
        const { blob } = base64ToBlob(reportProof)
        proofUrl = await uploadPostPhoto(blob, currentUser.id, 'photos')
      }
      const res = await reportUserAction({ reporterId: currentUser.id, reportedId: userId, reason: reportReason, description: reportDesc, proofPhotoUrl: proofUrl })
      if (res.success) {
        toast({ title: "Report Submitted" }); setReportDialogOpen(false); setReportDesc(""); setReportProof(null)
      }
    } finally { setIsReporting(false) }
  }

  const handleBlock = async () => {
    if (!currentUser || !profile) return
    try {
      const myBlocking = Array.from(new Set([...(profile.blocking || []), profile.uid]))
      const theirBlockedBy = Array.from(new Set([...(profile.blocked_by || []), currentUser.id]))
      await Promise.all([supabase.from('users').update({ blocking: myBlocking }).eq('uid', currentUser.id), supabase.from('users').update({ blocked_by: theirBlockedBy }).eq('uid', profile.uid)])
      toast({ title: "User Blocked" }); router.replace('/home')
    } catch (e) { toast({ variant: "destructive", title: "Error" }) }
  }

  if (loading) return <div className="fixed inset-0 bg-white flex items-center justify-center select-none z-[9999]"><h1 className="text-7xl font-logo font-black text-[#00A2FF] tracking-tight animate-pulse uppercase">QIVO</h1></div>
  if (!profile) return <div className="min-h-screen flex items-center justify-center p-8 text-black font-bold">Not found.</div>

  const age = Math.floor((Date.now() - new Date(profile.dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
  const allPhotos = Array.from(new Set([profile.photo_url, ...(profile.additional_photos || [])].filter(Boolean)));

  return (
    <div className="flex flex-col h-screen w-full bg-white relative overflow-hidden">
      <div className="flex-1 w-full overflow-y-auto no-scrollbar pb-40">
        <div className="relative h-[60vh] w-full overflow-hidden shrink-0">
          <Image src={profile.photo_url} alt={profile.name} fill className="object-cover" priority onClick={() => setSelectedImage(profile.photo_url)} />
          <div className="absolute top-12 inset-x-0 px-6 flex justify-between items-center z-20">
            <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full bg-white/10 backdrop-blur-xl text-white w-10 h-10 border border-white/20"><ChevronLeft className="w-6 h-6" /></Button>
            {!profile.is_admin && profile.uid !== currentUser?.id && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="rounded-full bg-white/10 backdrop-blur-xl text-white w-10 h-10 border border-white/20"><MoreHorizontal className="w-6 h-6" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="rounded-2xl min-w-[180px] p-2 border-none shadow-2xl">
                  <DropdownMenuItem onClick={handleBlock} className="rounded-xl h-12 text-red-500 font-bold gap-3 px-4"><Ban className="w-5 h-5" /> Block</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setReportDialogOpen(true)} className="rounded-xl h-12 font-bold gap-3 px-4 text-gray-400"><Flag className="w-5 h-5" /> Report</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          <div className="absolute bottom-0 inset-x-0 h-32 bg-gradient-to-t from-white to-transparent" />
        </div>

        <div className="px-6 space-y-8 -mt-10 relative z-10">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-black text-black tracking-tight">{profile.name}</h1>
              {profile.is_verified && <BadgeCheck className="w-6 h-6 text-[#00A2FF] fill-blue-50" />}
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="bg-black text-white px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest">{profile.gender === 'female' ? '♀' : '♂'} • {age} Years</div>
              <button onClick={handleCopyId} className="bg-gray-50 text-gray-500 px-4 py-1.5 rounded-full text-[11px] font-bold border border-gray-100 flex items-center gap-2">ID: {profile.match_flow_id} {idCopied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}</button>
            </div>
          </div>

          <section className="space-y-4">
            <div className="flex items-center gap-2 text-gray-400 uppercase text-[10px] font-black tracking-widest ml-1"><Quote className="w-3 h-3 text-[#00A2FF]" /> About</div>
            <div className="bg-gray-50/50 p-6 rounded-[2rem] border border-black/5 italic text-gray-600 text-[13px] leading-relaxed">"{profile.interests || "No bio yet."}"</div>
          </section>

          {allPhotos.length > 1 && (
            <section className="space-y-3">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Visual Gallery</p>
              <div className="grid grid-cols-4 gap-2">
                {allPhotos.map((url, i) => (
                  <div key={url} className="relative aspect-square rounded-2xl overflow-hidden cursor-pointer active:scale-95 transition-all shadow-sm" onClick={() => setSelectedImage(url)}>
                    <Image src={url} alt={`P${i}`} fill className="object-cover" sizes="20vw" />
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="grid grid-cols-1 gap-2 pb-10">
            <DetailItem icon={MapPin} label="Location" value={profile.country || "Global"} color="bg-blue-50 text-[#00A2FF]" />
            <DetailItem icon={GraduationCap} label="Academic" value={profile.education_level || "Not specified"} color="bg-purple-50 text-purple-600" />
            <DetailItem icon={Heart} label="Intentions" value={profile.looking_for || "Exploring"} color="bg-rose-50 text-rose-600" />
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 inset-x-0 p-6 bg-white/90 backdrop-blur-xl border-t border-black/5 z-[60] pb-[env(safe-area-inset-bottom,24px)]">
        <Button className="w-full h-16 rounded-2xl bg-[#00A2FF] hover:bg-[#0081CC] text-white text-sm font-black uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl shadow-blue-100" onClick={() => router.push(`/chats?startWith=${profile.uid}`)}><MessageSquare className="w-5 h-5 fill-white" /> Send Message</Button>
      </div>

      {selectedImage && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center animate-in fade-in" onClick={() => setSelectedImage(null)}>
          <button className="absolute top-12 right-6 w-10 h-10 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/20"><X className="w-6 h-6" /></button>
          <div className="relative w-full h-[80vh]"><Image src={selectedImage} alt="Full" fill className="object-contain" sizes="100vw" /></div>
        </div>
      )}

      <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
        <DialogContent className="max-w-[90vw] rounded-[2.5rem] p-8 border-none select-none">
          <DialogHeader className="items-center text-center space-y-4"><div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center text-red-500 shadow-inner"><Flag className="w-8 h-8 fill-current" /></div><DialogTitle className="text-xl font-black uppercase tracking-tight">Report User</DialogTitle></DialogHeader>
          <div className="space-y-6 py-4">
             <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-gray-400 ml-1">Reason</Label><select value={reportReason} onChange={(e) => setReportReason(e.target.value)} className="w-full h-12 rounded-xl bg-gray-50 border-none px-4 font-bold text-sm outline-none"><option>Inappropriate Content</option><option>Harassment</option><option>Scam/Fraud</option><option>Identity Theft</option><option>Underage User</option></select></div>
             <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-gray-400 ml-1">Description</Label><Textarea placeholder="Details..." value={reportDesc} onChange={(e) => setReportDesc(e.target.value)} className="rounded-2xl bg-gray-50 border-none min-h-[100px] p-4 text-sm font-medium" /></div>
             <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-gray-400 ml-1">Evidence</Label><div onClick={() => fileInputRef.current?.click()} className="h-32 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 flex flex-col items-center justify-center gap-2 cursor-pointer relative overflow-hidden">{reportProof ? <Image src={reportProof} alt="Proof" fill className="object-cover" /> : <><Camera className="w-6 h-6 text-gray-300" /><span className="text-[9px] font-black text-gray-400 uppercase">Tap to Upload</span></>}</div><input type="file" hidden ref={fileInputRef} accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) { const r = new FileReader(); r.onloadend = () => setReportProof(r.result as string); r.readAsDataURL(f); } }} /></div>
          </div>
          <DialogFooter className="flex-col gap-3 mt-4"><Button onClick={submitReport} disabled={isReporting || !reportDesc.trim()} className="w-full h-14 rounded-full bg-black text-white font-black uppercase tracking-widest text-[10px] shadow-xl">{isReporting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit Review"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DetailItem({ icon: Icon, label, value, color }: any) {
  return (
    <div className="flex items-center gap-4 bg-white p-4 rounded-2xl border border-black/[0.03] shadow-sm">
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-inner", color)}><Icon className="w-5 h-5" /></div>
      <div className="min-w-0"><p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5">{label}</p><p className="text-[14px] font-black text-black truncate tracking-tight">{value}</p></div>
    </div>
  )
}
