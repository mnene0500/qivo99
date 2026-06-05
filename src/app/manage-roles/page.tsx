
"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ChevronLeft, Users, Loader2, UserMinus, Search, ShieldCheck, Briefcase, Coins, AlertCircle, Trash2, Ban, ShieldAlert } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { toggleUserRoleAction, deleteUserCompletelyAction } from "@/app/actions/matchflow-actions"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/firebase/auth/use-user"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

interface TargetUser {
  uid: string
  name: string
  photo_url: string
  match_flow_id: string
  gender: string
  is_coin_seller: boolean
  is_agent: boolean
  is_admin: boolean
}

export default function ManageRolesPage() {
  const router = useRouter()
  const { user } = useUser()
  const { toast } = useToast()
  
  const [activeTab, setActiveTab] = useState<'search' | 'merchants' | 'agents'>('search')
  const [targetId, setTargetId] = useState("")
  const [targetUser, setTargetUser] = useState<TargetUser | null>(null)
  const [roleUsers, setRoleUsers] = useState<TargetUser[]>([])
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  const [banConfirm, setBanConfirm] = useState("")

  const handleSearch = async () => {
    if (!targetId.trim()) return
    setSearching(true)
    try {
      const { data } = await supabase.from("users").select('*').eq("match_flow_id", targetId.trim()).maybeSingle()
      if (data) setTargetUser(data as any)
      else { setTargetUser(null); toast({ variant: "destructive", title: "User not found" }); }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Search Error" })
    } finally {
      setSearching(false)
    }
  }

  const fetchRoleUsers = async () => {
    if (activeTab === 'search') return
    setLoading(true)
    let column = activeTab === 'merchants' ? 'is_coin_seller' : 'is_agent'
    const { data } = await supabase.from('users').select('*').eq(column, true).limit(50)
    setRoleUsers(data as any || [])
    setLoading(false)
  }

  useEffect(() => { fetchRoleUsers() }, [activeTab])

  const handleRoleUpdate = async (role: 'is_coin_seller' | 'is_agent', value: boolean, userToUpdate?: TargetUser) => {
    if (!user) return
    const target = userToUpdate || targetUser
    if (!target) return
    if (role === 'is_agent' && value === true && target.gender !== 'female') {
      toast({ variant: "destructive", title: "Only female agents allowed" }); return
    }
    setLoading(true)
    try {
      const result = await toggleUserRoleAction(user.id, target.match_flow_id, role, value)
      if (result.success) {
        toast({ title: "Authority Updated" })
        if (userToUpdate) fetchRoleUsers()
        else setTargetUser(prev => prev ? { ...prev, [role]: value } : null)
      }
    } finally { setLoading(false) }
  }

  const handleRemoveAccount = async (uid: string) => {
    if (banConfirm.toUpperCase() !== "BAN") {
      toast({ variant: "destructive", title: "Invalid Confirmation", description: "You must type BAN to confirm." });
      return;
    }
    setLoading(true)
    try {
      const res = await deleteUserCompletelyAction(uid)
      if (res.success) {
        toast({ title: "User Banned" })
        if (targetUser?.uid === uid) setTargetUser(null)
        setBanConfirm("");
        fetchRoleUsers()
      }
    } finally { setLoading(false) }
  }

  return (
    <div className="flex-1 bg-white min-h-screen flex flex-col select-none">
      <header className="px-4 h-16 flex items-center justify-between border-b bg-white sticky top-0 z-50">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full"><ChevronLeft className="w-6 h-6 text-black" /></Button>
        <h1 className="text-sm font-black text-black uppercase tracking-widest">Authority Control</h1>
        <div className="w-10" />
      </header>

      <div className="flex border-b sticky top-16 bg-white z-40">
        {[{ id: 'search', label: 'Search & Ban' }, { id: 'merchants', label: 'Merchants' }, { id: 'agents', label: 'Agents' }].map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={cn("px-4 py-4 flex-1 flex flex-col items-center gap-1 border-b-2 transition-all", activeTab === tab.id ? "border-[#00A2FF] text-[#00A2FF]" : "border-transparent text-gray-400")}>
            <span className="text-[10px] font-black uppercase tracking-widest">{tab.label}</span>
          </button>
        ))}
      </div>

      <main className="flex-1 p-6 space-y-8">
        {activeTab === 'search' ? (
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Search User ID</label>
              <div className="flex gap-2">
                <Input placeholder="Numeric ID" value={targetId} onChange={(e) => setTargetId(e.target.value)} className="rounded-2xl h-14 border-gray-100 bg-gray-50 font-bold" />
                <Button onClick={handleSearch} disabled={searching} className="h-14 w-14 rounded-2xl bg-black">{searching ? <Loader2 className="animate-spin text-white" /> : <Search className="w-5 h-5 text-white" />}</Button>
              </div>
            </div>

            {targetUser && (
              <div className="space-y-8 animate-in fade-in">
                <div className="p-8 bg-gray-50 border rounded-[3rem] flex flex-col items-center space-y-6 relative overflow-hidden">
                  <Avatar className="w-24 h-24 border-4 border-white shadow-xl relative z-10"><AvatarImage src={targetUser.photo_url} className="object-cover" /><AvatarFallback><Users /></AvatarFallback></Avatar>
                  <div className="text-center relative z-10"><p className="text-lg font-black text-black leading-none">{targetUser.name}</p><p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1.5">ID: {targetUser.match_flow_id}</p></div>
                  
                  <div className="w-full flex flex-col gap-3 pt-4 border-t border-black/5">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button className="w-full h-14 rounded-full bg-red-600 text-white font-black uppercase tracking-widest text-[10px] shadow-lg shadow-red-100 flex items-center justify-center gap-2">
                          <Ban className="w-4 h-4" /> Permanently Ban
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-[2.5rem] p-10 border-none shadow-2xl">
                        <AlertDialogHeader className="items-center">
                          <ShieldAlert className="w-16 h-16 text-red-500 mb-4" />
                          <AlertDialogTitle className="font-black uppercase tracking-tight text-center">Terminate Account?</AlertDialogTitle>
                          <AlertDialogDescription className="text-center text-xs font-bold text-gray-400 leading-relaxed uppercase tracking-widest">
                            This will instantly delete this user's profile, messages, and wallet. Type <span className="text-red-600">BAN</span> to confirm.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <div className="py-6">
                          <Input placeholder="Type BAN" value={banConfirm} onChange={(e) => setBanConfirm(e.target.value)} className="rounded-2xl h-16 text-center font-black bg-gray-50 border-gray-100 text-xl tracking-[0.4em] uppercase" />
                        </div>
                        <AlertDialogFooter className="flex flex-col gap-3">
                          <AlertDialogAction onClick={() => handleRemoveAccount(targetUser.uid)} disabled={banConfirm.toUpperCase() !== "BAN"} className="h-16 rounded-2xl bg-red-600 font-black text-sm uppercase tracking-widest">Execute Ban</AlertDialogAction>
                          <AlertDialogCancel className="h-14 rounded-2xl font-black text-[10px] uppercase border-none bg-gray-50">Cancel</AlertDialogCancel>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                <div className="space-y-4">
                  <RoleToggle label="Merchant Authority" active={targetUser.is_coin_seller} icon={Coins} color="text-yellow-600" onToggle={() => handleRoleUpdate('is_coin_seller', !targetUser.is_coin_seller)} disabled={loading} />
                  <RoleToggle label="Agency Leadership" active={targetUser.is_agent} icon={Briefcase} color="text-purple-600" onToggle={() => handleRoleUpdate('is_agent', !targetUser.is_agent)} disabled={loading || targetUser.gender !== 'female'} />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {loading ? <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#00A2FF]" /></div> : roleUsers.length === 0 ? (
              <div className="py-40 text-center opacity-30 px-12"><ShieldCheck className="w-12 h-12 mx-auto mb-4" /><p className="font-black text-xs uppercase tracking-widest">Empty Role List</p></div>
            ) : roleUsers.map(u => (
              <div key={u.uid} className="p-4 bg-gray-50 border border-black/5 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-3"><Avatar className="w-10 h-10 border border-white"><AvatarImage src={u.photo_url} /><AvatarFallback><Users /></AvatarFallback></Avatar><div><p className="text-xs font-black truncate">{u.name}</p><p className="text-[8px] font-bold text-gray-400 tracking-widest">ID: {u.match_flow_id}</p></div></div>
                <Button variant="ghost" size="icon" onClick={() => handleRoleUpdate(activeTab === 'merchants' ? 'is_coin_seller' : 'is_agent', false, u)} className="h-9 w-9 rounded-full bg-white text-red-500 shadow-sm"><UserMinus className="w-4 h-4" /></Button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function RoleToggle({ label, active, icon: Icon, color, onToggle, disabled }: any) {
  return (
    <div className="p-5 bg-white rounded-3xl border flex items-center justify-between shadow-sm">
      <div className="flex items-center gap-3"><div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", color.replace('text', 'bg').replace('600', '50'))}><Icon className={cn("w-5 h-5", color)} /></div><span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{label}</span></div>
      <Button onClick={onToggle} disabled={disabled} variant={active ? "destructive" : "outline"} className="h-9 px-6 rounded-full text-[9px] font-black uppercase tracking-widest">{active ? "Revoke" : "Appoint"}</Button>
    </div>
  )
}
