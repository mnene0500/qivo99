"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { 
  Settings, 
  ChevronRight, 
  Copy, 
  Check, 
  BadgeCheck, 
  Headphones, 
  Pencil,
  CircleDollarSign,
  Gem,
  Loader2,
  Trophy,
  Users,
  Briefcase,
  UserPlus,
  Wallet,
  Shield,
  User,
  Flag
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useToast } from "@/hooks/use-toast"
import { useUser } from "@/firebase/auth/use-user"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { createAgencyAction, joinAgencyAction } from "@/app/actions/matchflow-actions"

interface UserProfile {
  uid: string
  name: string
  photo_url: string
  match_flow_id?: string
  is_verified?: boolean
  is_admin?: boolean
  is_coin_seller?: boolean
  is_agent?: boolean
  gender?: string
  agency_id?: string
  agency_status?: string
}

function JoinAgencyDialog({ userUid }: { userUid: string }) {
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const { toast } = useToast()
  
  const handleJoin = async () => {
    if (code.length !== 5 || !userUid) return
    setLoading(true)
    const res = await joinAgencyAction(userUid, code)
    if (res.success) {
      toast({ title: "Success", description: "Application sent!" })
      setOpen(false)
    } else {
      toast({ variant: "destructive", title: "Error", description: res.error })
    }
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-20 bg-pink-500 rounded-2xl shadow-xl flex flex-col items-center justify-center gap-1 text-white col-span-2 mt-4">
          <UserPlus className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Join Agency</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-3xl p-8 max-w-[90vw]">
        <DialogHeader className="items-center text-center">
          <DialogTitle className="text-xl font-bold">Enter Agency Code</DialogTitle>
          <DialogDescription className="text-xs">Ask your agent for their 5-digit code.</DialogDescription>
        </DialogHeader>
        <div className="py-6">
          <Input 
            maxLength={5} 
            placeholder="e.g. 54321" 
            value={code} 
            onChange={(e) => setCode(e.target.value)}
            className="rounded-2xl h-16 text-center text-2xl font-bold tracking-[0.5em]" 
          />
        </div>
        <Button onClick={handleJoin} disabled={loading} className="w-full h-14 bg-pink-500 rounded-full font-bold uppercase shadow-lg">
          Apply Now
        </Button>
      </DialogContent>
    </Dialog>
  )
}

function AgencyDashboardDialog({ user }: { user: UserProfile }) {
  const [agencyName, setAgencyName] = useState("")
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const handleCreate = async () => {
    if (!agencyName.trim() || !user.uid) return
    setLoading(true)
    const res = await createAgencyAction(user.uid, agencyName)
    if (res.success) {
      toast({ title: "Agency Created", description: `Code: ${res.code}` })
    } else {
      toast({ variant: "destructive", title: "Error", description: res.error })
    }
    setLoading(false)
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="h-20 bg-blue-600 rounded-2xl shadow-xl flex flex-col items-center justify-center gap-1 text-white col-span-2 mt-4">
          <Briefcase className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Agency Center</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-3xl p-8 max-w-[90vw]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Agency Management</DialogTitle>
        </DialogHeader>
        <div className="py-6 space-y-4">
          {user.agency_id && user.agency_status === 'approved' ? (
            <div className="text-center space-y-4">
              <div className="bg-blue-50 p-6 rounded-3xl">
                <p className="text-[10px] font-bold text-blue-400 uppercase mb-2">Your Agency Code</p>
                <h3 className="text-4xl font-bold text-blue-600 tracking-[0.2em]">{user.agency_id}</h3>
              </div>
              <Button asChild className="w-full h-14 bg-blue-600 rounded-full font-bold shadow-lg">
                <Link href="/agency-manage">Manage Members</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Input 
                placeholder="Business Name" 
                value={agencyName} 
                onChange={(e) => setAgencyName(e.target.value)} 
                className="rounded-2xl h-14 border-gray-100 bg-gray-50" 
              />
              <Button onClick={handleCreate} disabled={loading} className="w-full h-14 bg-blue-600 rounded-full font-bold">
                {loading ? <Loader2 className="animate-spin" /> : "Establish Agency"}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function MePage() {
  const router = useRouter()
  const { user, loading: authLoading, isInitialized } = useUser()
  const { toast } = useToast()
  
  const [copied, setCopied] = useState(false)
  const [balances, setBalances] = useState({ coins: 0, diamonds: 0 })
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    if (!user && isInitialized && !authLoading) router.replace("/welcome")
    if (!user?.id) return

    const fetchProfile = async () => {
      const { data } = await supabase.from('users').select('*').eq('uid', user.id).maybeSingle()
      if (data) {
        setProfile(data as any)
        setIsReady(true)
      }
    }
    fetchProfile()

    const profileChannel = supabase.channel(`profile-sync:${user.id}`)
      .on('postgres_changes', { event: '*', table: 'users', filter: `uid=eq.${user.id}` }, (payload) => {
        setProfile(payload.new as any)
      })
      .subscribe()

    const balanceChannel = supabase.channel(`balance-sync:${user.id}`)
      .on('postgres_changes', { event: '*', table: 'balances', filter: `user_id=eq.${user.id}` }, (payload) => {
        setBalances({ coins: payload.new.coins || 0, diamonds: Number(payload.new.diamonds) || 0 })
      })
      .subscribe()
      
    supabase.from('balances').select('*').eq('user_id', user.id).single().then(({ data }) => {
      if (data) setBalances({ coins: data.coins || 0, diamonds: Number(data.diamonds) || 0 })
    })

    return () => { 
      supabase.removeChannel(profileChannel)
      supabase.removeChannel(balanceChannel)
    }
  }, [user?.id, isInitialized, authLoading, router])

  const handleCopyId = () => {
    if (profile?.match_flow_id) { 
      navigator.clipboard.writeText(profile.match_flow_id); 
      setCopied(true); 
      toast({ title: "ID Copied" }); 
      setTimeout(() => setCopied(false), 2000); 
    }
  }

  if (!isReady && (authLoading || !profile)) {
    return <div className="flex-1 bg-[#F8F9FA] min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-[#00A2FF]" /></div>
  }

  const freshPhotoUrl = profile?.photo_url ? `${profile.photo_url}?t=${Date.now()}` : null;
  
  return (
    <div className="flex-1 pb-24 bg-[#F8F9FA] min-h-screen relative select-none animate-in fade-in duration-300">
      <div className="absolute top-0 left-0 w-full h-[280px] bg-[#00A2FF] z-0" />
      
      <div className="relative z-10">
        <header className="relative pt-12 pb-10 px-6 flex flex-col items-center text-center">
          <div className="absolute top-6 right-6">
            <div className="bg-white/20 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/10 flex items-center gap-1.5">
              <span className="text-[9px] font-black text-white uppercase tracking-widest">
                {profile?.is_admin ? "ADMIN" : (profile?.is_agent ? "AGENT" : (profile?.is_verified ? "VERIFIED" : "MEMBER"))}
              </span>
            </div>
          </div>

          <div className="relative mb-4">
            <div className="relative w-28 h-28 rounded-full shadow-2xl overflow-hidden bg-muted border-4 border-white/20">
              {freshPhotoUrl ? (
                <Image 
                  key={freshPhotoUrl} 
                  src={freshPhotoUrl} 
                  alt={profile?.name || "User"} 
                  fill 
                  className="object-cover" 
                  priority 
                  sizes="112px" 
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-100">
                  <User className="w-12 h-12 text-gray-300" />
                </div>
              )}
            </div>
            <button 
              className="absolute bottom-1 right-1 bg-white p-3 rounded-full shadow-xl border border-black/5 active:scale-90 transition-all" 
              onClick={() => router.push('/edit-profile')}
            >
              <Pencil className="w-4 h-4 text-[#00A2FF]" />
            </button>
          </div>

          <div className="flex items-center justify-center gap-1.5 mb-1">
            <h2 className="text-xl font-bold text-white tracking-tight">{profile?.name || '...'}</h2>
            {profile?.is_verified && <BadgeCheck className="w-4 h-4 text-white fill-blue-500" />}
          </div>
          
          <div className="inline-flex items-center gap-1.5 cursor-pointer" onClick={handleCopyId}>
            <p className="text-white/70 font-semibold text-[9px] uppercase tracking-widest">ID: {profile?.match_flow_id}</p>
            {copied ? <Check className="w-2.5 h-2.5 text-green-300" /> : <Copy className="w-2.5 h-2.5 text-white/50" />}
          </div>
        </header>

        <main className="px-6 space-y-6">
          <div className="grid grid-cols-2 gap-4 relative z-20 -mt-6">
            <Button className="h-20 bg-white rounded-2xl shadow-xl flex flex-col items-center justify-center gap-1 text-[#00A2FF]">
              <div className="flex items-center gap-1.5">
                <CircleDollarSign className="w-5 h-5" />
                <span className="text-sm font-bold">{balances.coins}</span>
              </div>
              <span className="text-[8px] font-bold uppercase opacity-60">Wallet Balance</span>
            </Button>
            <Button className="h-20 bg-white rounded-2xl shadow-xl flex flex-col items-center justify-center gap-1 text-black" onClick={() => router.push("/income")}>
              <div className="flex items-center gap-1.5">
                <Gem className="w-5 h-5 text-[#4285F4]" />
                <span className="text-sm font-bold">{balances.diamonds.toFixed(0)}</span>
              </div>
              <span className="text-[8px] font-bold uppercase opacity-60">Income</span>
            </Button>

            {!profile?.is_verified && !profile?.is_admin && (
              <Button onClick={() => router.push("/verify-identity")} className="h-20 bg-white rounded-2xl shadow-xl flex flex-col items-center justify-center gap-1 text-indigo-600 col-span-2 mt-2">
                <div className="flex items-center gap-2">
                  <Shield className="w-6 h-6" />
                  <span className="text-sm font-bold uppercase tracking-widest">Verify Identity</span>
                </div>
              </Button>
            )}

            {(profile?.is_admin || profile?.is_coin_seller) && (
              <Button onClick={() => router.push("/award-coins")} className="h-20 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-2xl shadow-xl flex flex-col items-center justify-center gap-1 text-white col-span-2 mt-4">
                <div className="flex items-center gap-2">
                  <Trophy className="w-6 h-6" />
                  <span className="text-sm font-bold uppercase tracking-widest">Award Coins</span>
                </div>
              </Button>
            )}

            {profile?.is_admin && (
              <>
                <Button onClick={() => router.push("/manage-roles")} className="h-20 bg-white rounded-2xl shadow-xl flex flex-col items-center justify-center gap-1 text-purple-600 col-span-2 mt-4">
                  <div className="flex items-center gap-2">
                    <Users className="w-6 h-6" />
                    <span className="text-sm font-bold uppercase tracking-widest">Manage Roles</span>
                  </div>
                </Button>
                <Button onClick={() => router.push("/manage-reports")} className="h-20 bg-black rounded-2xl shadow-xl flex flex-col items-center justify-center gap-1 text-white col-span-2 mt-4">
                  <div className="flex items-center gap-2">
                    <Flag className="w-6 h-6 text-red-500" />
                    <span className="text-sm font-bold uppercase tracking-widest">Manage Reports</span>
                  </div>
                </Button>
              </>
            )}

            {profile?.is_agent && profile && <AgencyDashboardDialog user={profile} />}
            {profile?.gender === 'female' && profile?.agency_status !== 'approved' && !profile?.is_agent && !profile?.is_admin && <JoinAgencyDialog userUid={user?.id || ""} />}
            
            {profile?.agency_status === 'approved' && (
              <Button onClick={() => router.push("/agency-wallet")} className="h-24 bg-gradient-to-br from-indigo-700 via-blue-600 to-blue-500 rounded-[2.2rem] shadow-2xl flex flex-col items-center justify-center text-white col-span-2 mt-4">
                <div className="flex items-center gap-4">
                  <div className="bg-white/15 p-3 rounded-2xl">
                    <Wallet className="w-7 h-7 text-white" />
                  </div>
                  <span className="text-base font-black uppercase tracking-widest">Agency Wallet</span>
                </div>
              </Button>
            )}
          </div>

          <div className="bg-white rounded-3xl p-2 shadow-sm border border-black/5 flex flex-col overflow-hidden">
            <Button variant="ghost" className="h-16 justify-between px-5 rounded-none border-b border-gray-50" asChild>
              <Link href="/support">
                <div className="flex items-center gap-4">
                  <div className="bg-blue-50 p-2.5 rounded-xl"><Headphones className="w-5 h-5 text-blue-600" /></div>
                  <span className="font-semibold text-xs text-black">Support Center</span>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </Link>
            </Button>
            <Button variant="ghost" className="h-16 justify-between px-5 rounded-none" asChild>
              <Link href="/settings">
                <div className="flex items-center gap-4">
                  <div className="bg-gray-50 p-2.5 rounded-xl"><Settings className="w-5 h-5 text-gray-600" /></div>
                  <span className="font-semibold text-xs text-black">Settings</span>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </Link>
            </Button>
          </div>
        </main>
      </div>
    </div>
  )
}
