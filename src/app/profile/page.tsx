
"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Settings, ChevronRight, Copy, Check, BadgeCheck, Headphones, Pencil, Gem, Award, Briefcase, UserPlus, Wallet, Shield, PlusCircle, UserCheck, Flag, Star, Gamepad2 } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useToast } from "@/hooks/use-toast"
import { useUser } from "@/firebase/auth/use-user"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { createAgencyAction, joinAgencyAction, leaveAgencyAction } from "@/app/actions/matchflow-actions"
import { useBalance } from "@/lib/providers/BalanceProvider"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"

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

  const isOwner = !!(profile?.is_owner || profile?.is_admin)
  const isSpecial = !!profile?.is_special_user
  const isMerchant = !!(profile?.is_coin_seller || isOwner || isSpecial)
  const isAgent = !!profile?.is_agent
  const isVerified = !!profile?.is_verified
  
  const isKenyanFemale = profile?.gender === 'female' && profile?.country === 'Kenya'
  const isAgencyMember = profile?.agency_status === 'approved'
  
  const displayPhoto = profile?.photo_url || "https://picsum.photos/seed/qivo/400/400"
  const cacheBust = profile?.updated_at ? new Date(profile.updated_at).getTime() : Date.now()

  return (
    <div className="flex-1 pb-24 bg-white min-h-screen relative select-none animate-in fade-in duration-200">
      <div className="absolute top-0 left-0 w-full h-[280px] bg-[#00A2FF]" />
      <div className="relative z-10">
        <header className="pt-12 pb-10 px-6 flex flex-col items-center text-center">
          <div className="relative mb-4">
            <div className="relative w-28 h-28 rounded-full overflow-hidden bg-gray-100">
              <Image src={`${displayPhoto}?t=${cacheBust}`} alt={profile?.name || "Me"} fill className="object-cover" sizes="112px" priority />
            </div>
            <button className="absolute bottom-1 right-1 bg-white p-2.5 rounded-full shadow-xl active:scale-90 transition-transform" onClick={() => router.push('/edit-profile')}>
              <Pencil className="w-4 h-4 text-[#00A2FF]" />
            </button>
          </div>
          <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-1.5">
            {profile?.name || "User"} {isVerified && <BadgeCheck className="w-4 h-4 text-white fill-blue-500" />}
            {isSpecial && <Star className="w-4 h-4 text-yellow-300 fill-current" />}
          </h2>
          <p onClick={() => copyToClipboard(profile?.match_flow_id, setIdCopied)} className="text-white/60 font-black text-[9px] tracking-[0.2em] mt-2 cursor-pointer active:opacity-50 transition-opacity">
            ID: {profile?.match_flow_id || "---"} {idCopied ? <Check className="w-2.5 h-2.5 inline text-green-300" /> : <Copy className="w-2.5 h-2.5 inline opacity-50" />}
          </p>
        </header>

        <main className="px-6 space-y-6">
          <div className="grid grid-cols-2 gap-4 -mt-6">
            <Button className="h-24 bg-white rounded-3xl shadow-2xl flex flex-col items-center justify-center text-[#00A2FF] active:scale-95 transition-transform" onClick={() => router.push('/recharge')}>
              <div className="flex items-center gap-2"><PlusCircle className="w-5 h-5" /><span className="text-lg font-black">{coins}</span></div>
              <span className="text-[8px] font-black opacity-60 tracking-widest uppercase">Coins</span>
            </Button>
            <Button className="h-24 bg-white rounded-3xl shadow-2xl flex flex-col items-center justify-center text-black active:scale-95 transition-transform" onClick={() => router.push("/income")}>
              <div className="flex items-center gap-2"><Gem className="w-5 h-5 text-blue-500" /><span className="text-lg font-black">{Number(diamonds || 0).toFixed(0)}</span></div>
              <span className="text-[8px] font-black opacity-60 tracking-widest uppercase">Diamonds</span>
            </Button>
          </div>

          <section className="space-y-3">
            <h3 className="text-[10px] font-black text-gray-400 tracking-widest ml-1 uppercase">Social Gaming</h3>
            <div className="bg-white rounded-3xl p-2 shadow-sm border border-black/5 overflow-hidden">
              <Button variant="ghost" className="h-16 w-full justify-between px-5 rounded-none" onClick={() => router.push('/game-center')}>
                <div className="flex items-center gap-4">
                  <div className="bg-amber-50 p-2.5 rounded-xl"><Gamepad2 className="w-5 h-5 text-amber-600" /></div>
                  <div className="flex flex-col items-start">
                     <span className="font-black text-[11px] tracking-widest text-black uppercase">Game Center</span>
                     <span className="text-[8px] font-bold text-amber-500 tracking-tighter uppercase">Win coins while playing</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </Button>
            </div>
          </section>

          {(isOwner || isSpecial) && (
            <section className="space-y-3">
              <h3 className="text-[10px] font-black text-gray-400 tracking-widest ml-1 uppercase">{isSpecial ? "Special Console" : "Owner Console"}</h3>
              <div className="bg-white rounded-3xl p-2 shadow-sm border border-black/5 flex flex-col overflow-hidden">
                <Button variant="ghost" className="h-16 justify-between px-5 rounded-none border-b border-gray-50" asChild>
                  <Link href="/manage-roles">
                    <div className="flex items-center gap-4">
                      <div className="bg-indigo-50 p-2.5 rounded-xl"><Shield className="w-5 h-5 text-indigo-600" /></div>
                      <span className="font-black text-[11px] tracking-widest text-black uppercase">Authority Manager</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </Link>
                </Button>
                <Button variant="ghost" className="h-16 justify-between px-5 rounded-none border-b border-gray-50" asChild>
                  <Link href="/manage-reports">
                    <div className="flex items-center gap-4">
                      <div className="bg-red-50 p-2.5 rounded-xl"><Flag className="w-5 h-5 text-red-600" /></div>
                      <span className="font-black text-[11px] tracking-widest text-black uppercase">Report Queue</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </Link>
                </Button>
                <Button variant="ghost" className="h-16 justify-between px-5 rounded-none" onClick={() => router.push('/award-coins')}>
                  <div className="flex items-center gap-4">
                    <div className="bg-yellow-50 p-2.5 rounded-xl"><Award className="w-5 h-5 text-yellow-600" /></div>
                    <span className="font-black text-[11px] tracking-widest text-black uppercase">Coin Terminal</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </Button>
              </div>
            </section>
          )}

          {!isVerified && (
            <section className="space-y-3">
              <h3 className="text-[10px] font-black text-gray-400 tracking-widest ml-1 uppercase">Identity Trust</h3>
              <div className="bg-white rounded-3xl p-2 shadow-sm border border-black/5 overflow-hidden">
                <Button variant="ghost" className="h-16 w-full justify-between px-5 rounded-none" onClick={() => router.push('/verify-identity')}>
                  <div className="flex items-center gap-4">
                    <div className="bg-blue-50 p-2.5 rounded-xl"><UserCheck className="w-5 h-5 text-[#00A2FF]" /></div>
                    <div className="flex flex-col items-start">
                       <span className="font-black text-[11px] tracking-widest text-black uppercase">Verify My Face</span>
                       <span className="text-[8px] font-bold text-[#00A2FF] tracking-tighter uppercase">Get Trusted Badge</span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </Button>
              </div>
            </section>
          )}

          {isMerchant && !isOwner && !isSpecial && (
            <section className="space-y-3">
              <h3 className="text-[10px] font-black text-gray-400 tracking-widest ml-1 uppercase">Merchant Console</h3>
              <div className="bg-white rounded-3xl p-2 shadow-sm border border-black/5 flex flex-col overflow-hidden">
                <Button variant="ghost" className="h-16 justify-between px-5 rounded-none" onClick={() => router.push('/award-coins')}>
                  <div className="flex items-center gap-4">
                    <div className="bg-yellow-50 p-2.5 rounded-xl"><Award className="w-5 h-5 text-yellow-600" /></div>
                    <span className="font-black text-[11px] tracking-widest text-black uppercase">Award Coins</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </Button>
              </div>
            </section>
          )}

          {isKenyanFemale && (
            <section className="space-y-3">
              <h3 className="text-[10px] font-black text-gray-400 tracking-widest ml-1 uppercase">Agency Access</h3>
              <div className="bg-white rounded-3xl p-2 shadow-sm border border-black/5 flex flex-col overflow-hidden">
                {isAgent && profile?.agency_id && (
                  <Button variant="ghost" className="h-16 justify-between px-5 rounded-none border-b border-gray-50" onClick={() => router.push('/agency-manage')}>
                    <div className="flex items-center gap-4">
                      <div className="bg-purple-50 p-2.5 rounded-xl"><Briefcase className="w-5 h-5 text-purple-600" /></div>
                      <span className="font-black text-[11px] tracking-widest text-black uppercase">Agency Center</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </Button>
                )}
                
                {isAgencyMember && (
                  <Button variant="ghost" className="h-16 justify-between px-5 rounded-none border-b border-gray-50" onClick={() => router.push('/agency-wallet')}>
                    <div className="flex items-center gap-4">
                      <div className="bg-emerald-50 p-2.5 rounded-xl"><Wallet className="w-5 h-5 text-emerald-600" /></div>
                      <span className="font-black text-[11px] tracking-widest text-black uppercase">Agency Wallet</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </Button>
                )}

                {!profile?.agency_id ? (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="ghost" className="h-16 justify-between px-5 rounded-none">
                        <div className="flex items-center gap-4">
                          <div className="bg-blue-50 p-2.5 rounded-xl"><UserPlus className="w-5 h-5 text-blue-600" /></div>
                          <span className="font-black text-[11px] tracking-widest text-black uppercase">Join Agency</span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-300" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="rounded-3xl p-8">
                      <DialogHeader><DialogTitle className="text-xl font-black tracking-tight uppercase">Agency Portal</DialogTitle></DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-gray-400 uppercase">Invite Code</label>
                          <Input placeholder="5-digit code" value={agencyCode} onChange={(e) => setAgencyCode(e.target.value)} className="rounded-xl h-12 font-bold" />
                        </div>
                        <Button onClick={handleJoinAgency} disabled={isProcessing || !agencyCode} className="w-full h-12 rounded-xl bg-[#00A2FF] font-black text-[10px] tracking-widest uppercase">Join Now</Button>
                        {isAgent && !profile?.agency_id && (
                          <div className="pt-4 border-t mt-4 space-y-4">
                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-gray-400 uppercase">Agency Name</label>
                              <Input placeholder="Enter Name" value={agencyName} onChange={(e) => setAgencyName(e.target.value)} className="rounded-xl h-12 font-bold" />
                            </div>
                            <Button onClick={handleCreateAgency} disabled={isProcessing || !agencyName} variant="outline" className="w-full h-12 rounded-xl border-purple-200 text-purple-600 font-black text-[10px] tracking-widest uppercase">Create Agency</Button>
                          </div>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                ) : (
                  <div className="h-16 flex items-center justify-between px-5">
                     <div className="flex items-center gap-4">
                       <div className="bg-blue-50 p-2.5 rounded-xl"><Briefcase className="w-5 h-5 text-blue-600" /></div>
                       <div className="flex flex-col"><span className="font-black text-[11px] tracking-widest text-black uppercase">{isAgent ? "Agency Leader" : "Agency Member"}</span><span className="text-[9px] font-bold text-[#00A2FF] uppercase">{profile.agency_status}</span></div>
                     </div>
                     {!isAgent && (
                       <AlertDialog>
                          <AlertDialogTrigger asChild><Button variant="ghost" size="sm" className="h-8 rounded-full text-red-500 text-[9px] font-black tracking-widest bg-red-50 px-4 uppercase">Leave</Button></AlertDialogTrigger>
                          <AlertDialogContent className="rounded-3xl p-8 border-none shadow-2xl"><AlertDialogHeader><AlertDialogTitle className="font-black text-center uppercase">Leave Agency?</AlertDialogTitle></AlertDialogHeader><AlertDialogFooter className="gap-3 mt-6"><AlertDialogCancel className="h-12 rounded-xl font-black text-[10px] uppercase">Cancel</AlertDialogCancel><AlertDialogAction onClick={handleLeaveAgency} className="h-12 rounded-xl bg-red-500 font-black text-[10px] uppercase">Leave</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
                       </AlertDialog>
                     )}
                  </div>
                )}
              </div>
            </section>
          )}

          <section className="space-y-3 pb-10">
            <h3 className="text-[10px] font-black text-gray-400 tracking-widest ml-1 uppercase">Account & Support</h3>
            <div className="bg-white rounded-3xl p-2 shadow-sm border border-black/5 flex flex-col overflow-hidden">
              <Button variant="ghost" className="h-16 justify-between px-5 rounded-none border-b border-gray-50" asChild>
                <Link href="/support">
                  <div className="flex items-center gap-4">
                    <div className="bg-blue-50 p-2.5 rounded-xl"><Headphones className="w-5 h-5 text-blue-600" /></div>
                    <span className="font-black text-[11px] tracking-widest text-black uppercase">Support Center</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </Link>
              </Button>
              <Button variant="ghost" className="h-16 justify-between px-5 rounded-none" asChild>
                <Link href="/settings">
                  <div className="flex items-center gap-4">
                    <div className="bg-gray-50 p-2.5 rounded-xl"><Settings className="w-5 h-5 text-gray-600" /></div>
                    <span className="font-black text-[11px] tracking-widest text-black uppercase">Settings</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </Link>
              </Button>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}
