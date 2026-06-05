"use client"

import { useEffect, useState, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Settings, ChevronRight, Copy, Check, BadgeCheck, Headphones, Pencil, Gem, Award, Briefcase, UserPlus, Wallet, Shield, PlusCircle, UserCheck, Flag, Gamepad2, Coins } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useToast } from "@/hooks/use-toast"
import { useUser } from "@/firebase/auth/use-user"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { createAgencyAction, joinAgencyAction, leaveAgencyAction } from "@/app/actions/matchflow-actions"
import { useBalance } from "@/lib/providers/BalanceProvider"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"

let cachedProfile: any = null;

export default function MePage() {
  const router = useRouter()
  const { user, loading: authLoading, isInitialized } = useUser()
  const { toast } = useToast()
  const { coins, diamonds } = useBalance();
  
  const [idCopied, setIdCopied] = useState(false)
  const [profile, setProfile] = useState<any>(cachedProfile)
  const [agencyCode, setAgencyCode] = useState("")
  const [agencyName, setAgencyName] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)

  const fetchProfile = useCallback(async () => {
    if (!user?.id) return
    
    try {
      const { data } = await supabase.from('users').select('*').eq('uid', user.id).maybeSingle();
      if (data) {
        setProfile(data)
        cachedProfile = data
      }
    } catch (e) {
      console.error("Profile load error")
    }
  }, [user?.id])

  useEffect(() => {
    if (isInitialized && !authLoading && !user) {
        router.replace("/welcome")
        return
    }
    if (user?.id) {
        fetchProfile()
    }
  }, [user, isInitialized, authLoading, fetchProfile, router])

  const copyToClipboard = (text: string, setCopied: (val: boolean) => void) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast({ title: "Copied" });
    setTimeout(() => setCopied(false), 2000);
  }

  const handleJoinAgency = async () => {
    if (!user || !agencyCode) return
    setIsProcessing(true)
    const res = await joinAgencyAction(user.id, agencyCode)
    if (res.success) {
      toast({ title: "Request Sent" });
      fetchProfile()
    } else {
      toast({ variant: "destructive", title: "Error", description: res.error })
    }
    setIsProcessing(false)
  }

  const handleLeaveAgency = async () => {
    if (!user) return
    setIsProcessing(true)
    const res = await leaveAgencyAction(user.id)
    if (res.success) {
      toast({ title: "Left Agency" });
      fetchProfile()
    } else {
      toast({ variant: "destructive", title: "Error", description: res.error })
    }
    setIsProcessing(false)
  }

  const handleCreateAgency = async () => {
    if (!user || !agencyName) return
    setIsProcessing(true)
    const res = await createAgencyAction(user.id, agencyName)
    if (res.success) {
      toast({ title: "Agency Created!" });
      fetchProfile()
    } else {
      toast({ variant: "destructive", title: "Error", description: res.error })
    }
    setIsProcessing(false)
  }

  if (authLoading || !isInitialized) return null;

  const isAdmin = !!profile?.is_admin
  const isMerchant = !!(profile?.is_coin_seller || isAdmin)
  const isAgent = !!profile?.is_agent
  const isVerified = !!profile?.is_verified
  
  const isKenyanFemale = profile?.gender === 'female' && profile?.country === 'Kenya'
  const isAgencyMember = profile?.agency_status === 'approved'
  
  const displayPhoto = profile?.photo_url || "https://picsum.photos/seed/qivo/400/400"
  const cacheBust = profile?.updated_at ? new Date(profile.updated_at).getTime() : Date.now()

  return (
    <div className="flex-1 pb-24 bg-[#F8FAFC] min-h-screen relative select-none animate-in fade-in duration-300">
      {/* BRAND HEADER */}
      <div className="absolute top-0 left-0 w-full h-80 bg-gradient-to-b from-[#00A2FF] to-[#0081CC] rounded-b-[3.5rem] shadow-2xl" />
      
      <div className="relative z-10">
        <header className="pt-16 pb-12 px-6 flex flex-col items-center text-center">
          <div className="relative mb-6">
            <div className="relative w-32 h-32 rounded-full overflow-hidden bg-white/20 backdrop-blur-xl p-1 shadow-2xl hover:scale-105 transition-transform duration-500">
              <div className="w-full h-full rounded-full overflow-hidden bg-gray-100">
                <Image src={`${displayPhoto}?t=${cacheBust}`} alt={profile?.name || "Me"} fill className="object-cover" sizes="128px" priority />
              </div>
            </div>
            <button 
              className="absolute -bottom-1 right-2 bg-white p-2.5 rounded-full shadow-xl active:scale-90 transition-transform border border-gray-50" 
              onClick={() => router.push('/edit-profile')}
            >
              <Pencil className="w-4 h-4 text-[#00A2FF]" />
            </button>
          </div>
          
          <div className="space-y-1">
            <h2 className="text-2xl font-black text-white tracking-tight flex items-center justify-center gap-2">
              {profile?.name || "User"} 
              {isVerified && <BadgeCheck className="w-5 h-5 text-white fill-[#00A2FF]" />}
              {isAdmin && <Shield className="w-5 h-5 text-indigo-200 fill-current" />}
            </h2>
            <button 
              onClick={() => copyToClipboard(profile?.match_flow_id, setIdCopied)} 
              className="px-4 py-1.5 bg-black/10 backdrop-blur-md rounded-full text-white/80 font-black text-[10px] tracking-[0.2em] uppercase active:opacity-50 transition-all flex items-center gap-2 mx-auto border border-white/10"
            >
              ID: {profile?.match_flow_id || "---"} 
              {idCopied ? <Check className="w-3 h-3 text-green-300" /> : <Copy className="w-3 h-3 opacity-50" />}
            </button>
          </div>
        </header>

        <main className="px-6 space-y-8">
          {/* BALANCE CARDS */}
          <div className="grid grid-cols-2 gap-4 -mt-8">
            <button 
              className="group relative h-32 bg-white rounded-[2.5rem] shadow-xl flex flex-col items-center justify-center overflow-hidden border border-white active:scale-95 transition-all"
              onClick={() => router.push('/recharge')}
            >
              <div className="absolute top-0 right-0 w-16 h-16 bg-[#00A2FF]/5 rounded-bl-[3rem]" />
              <div className="flex items-center gap-2 mb-1">
                <div className="p-2 bg-blue-50 rounded-xl group-hover:bg-[#00A2FF] group-hover:text-white transition-colors">
                  <Coins className="w-5 h-5 text-[#00A2FF] group-hover:text-white" />
                </div>
                <span className="text-2xl font-black text-black tracking-tighter">{coins.toLocaleString()}</span>
              </div>
              <span className="text-[10px] font-black text-gray-400 tracking-widest uppercase">Coins</span>
            </button>
            
            <button 
              className="group relative h-32 bg-white rounded-[2.5rem] shadow-xl flex flex-col items-center justify-center overflow-hidden border border-white active:scale-95 transition-all"
              onClick={() => router.push("/income")}
            >
              <div className="absolute top-0 right-0 w-16 h-16 bg-purple-500/5 rounded-bl-[3rem]" />
              <div className="flex items-center gap-2 mb-1">
                <div className="p-2 bg-purple-50 rounded-xl group-hover:bg-purple-500 group-hover:text-white transition-colors">
                  <Gem className="w-5 h-5 text-purple-500 group-hover:text-white" />
                </div>
                <span className="text-2xl font-black text-black tracking-tighter">{Number(diamonds || 0).toFixed(0)}</span>
              </div>
              <span className="text-[10px] font-black text-gray-400 tracking-widest uppercase">Diamonds</span>
            </button>
          </div>

          {/* SOCIAL & GAMING */}
          <section className="space-y-4">
            <h3 className="text-[11px] font-black text-slate-400 tracking-[0.2em] ml-2 uppercase">Entertainment</h3>
            <div className="bg-white rounded-[2.5rem] p-2 shadow-sm border border-slate-200/60 overflow-hidden">
              <Button variant="ghost" className="h-20 w-full justify-between px-6 rounded-none group" onClick={() => router.push('/game-center')}>
                <div className="flex items-center gap-5">
                  <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform">
                    <Gamepad2 className="w-6 h-6 text-amber-600" />
                  </div>
                  <div className="flex flex-col items-start">
                     <span className="font-black text-sm tracking-tight text-slate-900">Game Center</span>
                     <span className="text-[10px] font-bold text-amber-500 tracking-tight uppercase">Win coins while playing</span>
                  </div>
                </div>
                <div className="w-8 h-8 bg-slate-50 rounded-full flex items-center justify-center border border-slate-100">
                  <ChevronRight className="w-4 h-4 text-slate-300" />
                </div>
              </Button>
            </div>
          </section>

          {/* PRIVILEGED ACCESS */}
          {(isAdmin || isMerchant || isAgent || !isVerified) && (
            <section className="space-y-4">
              <h3 className="text-[11px] font-black text-slate-400 tracking-[0.2em] ml-2 uppercase">Console & Security</h3>
              <div className="bg-white rounded-[2.5rem] p-2 shadow-sm border border-slate-200/60 flex flex-col overflow-hidden">
                {isAdmin && (
                  <>
                    <RoleAction icon={Shield} color="bg-indigo-50 text-indigo-600" label="Authority Manager" href="/manage-roles" />
                    <RoleAction icon={Flag} color="bg-red-50 text-red-600" label="Report Queue" href="/manage-reports" />
                  </>
                )}
                
                {isMerchant && (
                  <RoleAction icon={Award} color="bg-yellow-50 text-yellow-600" label="Award Coins" href="/award-coins" />
                )}

                {isAgent && profile?.agency_id && (
                  <RoleAction icon={Briefcase} color="bg-purple-50 text-purple-600" label="Agency Center" href="/agency-manage" />
                )}

                {!isVerified && (
                  <RoleAction icon={UserCheck} color="bg-blue-50 text-[#00A2FF]" label="Verify Identity" href="/verify-identity" subtitle="Get Trusted Badge" />
                )}
              </div>
            </section>
          )}

          {/* AGENCY PORTAL */}
          {isKenyanFemale && (
            <section className="space-y-4">
              <h3 className="text-[11px] font-black text-slate-400 tracking-[0.2em] ml-2 uppercase">Agency</h3>
              <div className="bg-white rounded-[2.5rem] p-2 shadow-sm border border-slate-200/60 flex flex-col overflow-hidden">
                {isAgencyMember ? (
                  <>
                    <RoleAction icon={Wallet} color="bg-emerald-50 text-emerald-600" label="Agency Wallet" href="/agency-wallet" />
                    <div className="h-20 flex items-center justify-between px-6 border-t border-slate-50">
                      <div className="flex items-center gap-5">
                        <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center">
                          <Briefcase className="w-6 h-6 text-slate-400" />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-black text-sm text-slate-900 uppercase tracking-tight">{isAgent ? "Agency Leader" : "Member"}</span>
                          <span className="text-[10px] font-bold text-[#00A2FF] uppercase tracking-widest">{profile.agency_status}</span>
                        </div>
                      </div>
                      {!isAgent && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-10 rounded-2xl text-red-500 font-black text-[10px] tracking-widest bg-red-50 px-6 uppercase active:scale-95 transition-all">Leave</Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="rounded-[2.5rem] p-8 border-none shadow-2xl">
                            <AlertDialogHeader><AlertDialogTitle className="font-black text-center uppercase tracking-tight">Leave Agency?</AlertDialogTitle></AlertDialogHeader>
                            <AlertDialogFooter className="gap-3 mt-6">
                              <AlertDialogCancel className="h-14 rounded-2xl font-black text-[10px] uppercase border-none bg-slate-50">Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={handleLeaveAgency} className="h-14 rounded-2xl bg-red-500 font-black text-[10px] uppercase shadow-lg shadow-red-100">Leave</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </>
                ) : (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="ghost" className="h-20 justify-between px-6 rounded-none group">
                        <div className="flex items-center gap-5">
                          <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                            <UserPlus className="w-6 h-6 text-blue-600" />
                          </div>
                          <span className="font-black text-sm tracking-tight text-slate-900">Join Agency</span>
                        </div>
                        <div className="w-8 h-8 bg-slate-50 rounded-full flex items-center justify-center border border-slate-100">
                          <ChevronRight className="w-4 h-4 text-slate-300" />
                        </div>
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="rounded-[2.5rem] p-10 border-none shadow-2xl">
                      <DialogHeader><DialogTitle className="text-2xl font-black tracking-tight uppercase text-center">Agency Portal</DialogTitle></DialogHeader>
                      <div className="space-y-6 py-6">
                        <div className="space-y-3">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Invite Code</label>
                          <Input placeholder="5-digit code" value={agencyCode} onChange={(e) => setAgencyCode(e.target.value)} className="rounded-2xl h-16 font-black text-xl text-center border-slate-100 bg-slate-50" />
                        </div>
                        <Button onClick={handleJoinAgency} disabled={isProcessing || !agencyCode} className="w-full h-16 rounded-2xl bg-[#00A2FF] font-black text-sm tracking-[0.2em] uppercase shadow-xl shadow-blue-100">Join Now</Button>
                        
                        {isAgent && !profile?.agency_id && (
                          <div className="pt-8 border-t border-slate-50 mt-4 space-y-6">
                            <div className="space-y-3">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Establish New Agency</label>
                              <Input placeholder="Agency Name" value={agencyName} onChange={(e) => setAgencyName(e.target.value)} className="rounded-2xl h-14 font-bold border-slate-100 bg-slate-50" />
                            </div>
                            <Button onClick={handleCreateAgency} disabled={isProcessing || !agencyName} variant="outline" className="w-full h-16 rounded-2xl border-purple-200 text-purple-600 font-black text-sm tracking-[0.2em] uppercase active:bg-purple-50">Create Agency</Button>
                          </div>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </section>
          )}

          {/* APP & SUPPORT */}
          <section className="space-y-4 pb-20">
            <h3 className="text-[11px] font-black text-slate-400 tracking-[0.2em] ml-2 uppercase">Account</h3>
            <div className="bg-white rounded-[2.5rem] p-2 shadow-sm border border-slate-200/60 flex flex-col overflow-hidden">
              <RoleAction icon={Headphones} color="bg-blue-50 text-blue-600" label="Support Center" href="/support" />
              <RoleAction icon={Settings} color="bg-slate-50 text-slate-600" label="Settings" href="/settings" hideBorder />
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}

function RoleAction({ icon: Icon, color, label, href, subtitle, hideBorder }: { icon: any, color: string, label: string, href: string, subtitle?: string, hideBorder?: boolean }) {
  const router = useRouter()
  return (
    <Button 
      variant="ghost" 
      className={cn(
        "h-20 justify-between px-6 rounded-none group",
        !hideBorder && "border-b border-slate-50"
      )} 
      onClick={() => router.push(href)}
    >
      <div className="flex items-center gap-5">
        <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform shadow-inner", color)}>
          <Icon className="w-6 h-6" />
        </div>
        <div className="flex flex-col items-start">
          <span className="font-black text-sm tracking-tight text-slate-900">{label}</span>
          {subtitle && <span className="text-[10px] font-bold text-[#00A2FF] uppercase tracking-tighter">{subtitle}</span>}
        </div>
      </div>
      <div className="w-8 h-8 bg-slate-50 rounded-full flex items-center justify-center border border-slate-100">
        <ChevronRight className="w-4 h-4 text-slate-300" />
      </div>
    </Button>
  )
}
