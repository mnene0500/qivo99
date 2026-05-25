"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { supabase, base64ToBlob, uploadProfilePhoto, uploadPostPhoto } from "@/lib/supabase"
import { useUser } from "@/firebase/auth/use-user"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { ChevronLeft, Loader2, Save, Camera, Plus, X } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import Cropper from "react-easy-crop"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import Image from "next/image"

export default function EditProfilePage() {
  const router = useRouter()
  const { user } = useUser()
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({ name: "", interests: "", photo_url: "", additional_photos: [] as string[] })

  const [cropOpen, setCropOpen] = useState(false)
  const [tempImage, setTempImage] = useState<string | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 }); const [zoom, setZoom] = useState(1); const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const [targetPhotoIndex, setTargetPhotoIndex] = useState<number | 'profile'>('profile')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (user?.id) {
      supabase.from('users').select('*').eq('uid', user.id).single().then(({ data }) => {
        if (data) setFormData({ name: data.name || "", interests: data.interests || "", photo_url: data.photo_url || "", additional_photos: data.additional_photos || [] })
        setLoading(false)
      })
    }
  }, [user?.id])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader(); reader.onload = () => {
      const res = reader.result as string;
      if (targetPhotoIndex === 'profile') { 
        setTempImage(res); 
        setCropOpen(true); 
      } else { 
        const n = [...formData.additional_photos]; 
        n.push(res); 
        setFormData({ ...formData, additional_photos: n.slice(0, 4) }); 
      }
    }; reader.readAsDataURL(file)
  }

  const handleSave = async () => {
    if (!user?.id) return
    setSaving(true)
    try {
      let finalPhotoUrl = formData.photo_url;
      if (formData.photo_url.startsWith('data:image')) {
        const { blob } = base64ToBlob(formData.photo_url);
        finalPhotoUrl = await uploadProfilePhoto(blob, user.id);
      }
      const finalGallery = await Promise.all(formData.additional_photos.map(async (p) => {
        if (p.startsWith('data:image')) { const { blob } = base64ToBlob(p); return uploadPostPhoto(blob, user.id); }
        return p;
      }))
      await supabase.from('users').update({ name: formData.name, interests: formData.interests, photo_url: finalPhotoUrl, additional_photos: finalGallery, updated_at: new Date().toISOString() }).eq('uid', user.id)
      toast({ title: "Profile Updated" }); router.replace('/profile')
    } catch (e: any) { toast({ variant: "destructive", title: "Failed", description: e.message }); setSaving(false); }
  }

  if (loading) return <div className="h-screen flex items-center justify-center bg-white"><Loader2 className="animate-spin text-[#00A2FF]" /></div>

  return (
    <div className="flex-1 bg-white min-h-screen flex flex-col pb-20 select-none">
      <header className="px-4 h-16 flex items-center justify-between border-b sticky top-0 bg-white z-50">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full"><ChevronLeft className="w-6 h-6 text-black" /></Button>
        <h1 className="text-sm font-black text-black uppercase tracking-widest">Edit Profile</h1>
        <Button variant="ghost" size="icon" onClick={handleSave} disabled={saving} className="text-[#00A2FF]">{saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}</Button>
      </header>

      <main className="flex-1 p-6 space-y-8 overflow-y-auto no-scrollbar">
        <div className="flex flex-col items-center">
          <div className="relative group cursor-pointer" onClick={() => { setTargetPhotoIndex('profile'); fileInputRef.current?.click(); }}>
            <Avatar className="w-32 h-32 border-4 border-gray-50 shadow-2xl overflow-hidden bg-gray-100">
              <AvatarImage src={formData.photo_url} className="object-cover" />
              <AvatarFallback className="bg-gray-100"><Camera className="w-10 h-10 text-gray-300" /></AvatarFallback>
            </Avatar>
            <div className="absolute bottom-1 right-1 bg-[#00A2FF] p-2.5 rounded-full text-white shadow-xl border-2 border-white"><Camera className="w-5 h-5" /></div>
          </div>
          <p className="mt-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Update Avatar</p>
        </div>

        <div className="space-y-4">
          <Label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Gallery (Max 4)</Label>
          <div className="grid grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="relative aspect-square rounded-2xl bg-gray-50 border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden cursor-pointer active:scale-95" onClick={() => { setTargetPhotoIndex(i); fileInputRef.current?.click(); }}>
                {formData.additional_photos[i] ? (
                  <>
                    <Image src={formData.additional_photos[i]} alt="P" fill className="object-cover" sizes="20vw" />
                    <button onClick={(e) => { e.stopPropagation(); const n = [...formData.additional_photos]; n.splice(i,1); setFormData({...formData, additional_photos: n}); }} className="absolute top-1 right-1 bg-black/50 p-1.5 rounded-full text-white"><X className="w-3 h-3" /></button>
                  </>
                ) : (<Plus className="w-6 h-6 text-gray-300" />)}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6 pt-4">
          <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-gray-400 ml-1">Display Name</Label><Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="rounded-2xl h-14 border-gray-100 bg-gray-50 font-bold" /></div>
          <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-gray-400 ml-1">Bio & Interests</Label><textarea value={formData.interests} onChange={(e) => setFormData({...formData, interests: e.target.value})} className="w-full rounded-2xl min-h-[120px] border border-gray-100 bg-gray-50 font-medium text-sm p-4 outline-none" /></div>
        </div>
      </main>
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />

      <Dialog open={cropOpen} onOpenChange={setCropOpen}>
        <DialogContent className="max-w-md h-[500px] p-0 overflow-hidden rounded-[2.5rem] border-none">
          <DialogHeader className="p-4 border-b bg-white text-center"><DialogTitle className="font-black uppercase text-[10px] tracking-widest">Adjust View</DialogTitle></DialogHeader>
          <div className="relative flex-1 bg-black h-full min-h-[300px]">{tempImage && (<Cropper image={tempImage} crop={crop} zoom={zoom} aspect={1} onCropChange={setCrop} onCropComplete={(_, p) => setCroppedAreaPixels(p)} onZoomChange={setZoom} />)}</div>
          <DialogFooter className="p-4 bg-white"><Button onClick={async () => {
            const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d'); const img = new (window as any).Image(); img.src = tempImage;
            await new Promise(r => img.onload = r); canvas.width = (croppedAreaPixels as any).width; canvas.height = (croppedAreaPixels as any).height;
            ctx?.drawImage(img, (croppedAreaPixels as any).x, (croppedAreaPixels as any).y, (croppedAreaPixels as any).width, (croppedAreaPixels as any).height, 0, 0, canvas.width, canvas.height);
            setFormData({ ...formData, photo_url: canvas.toDataURL('image/jpeg', 0.85) }); setCropOpen(false);
          }} className="w-full h-14 rounded-full bg-[#00A2FF] text-white font-bold uppercase tracking-widest">Apply Crop</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}