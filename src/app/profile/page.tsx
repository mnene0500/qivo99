"use client"

import { useMemo, useEffect, useState } from "react"
import { doc } from "firebase/firestore"
import { ref, onValue, off } from "firebase/database"
import { useFirestore, useUser, useDoc, useDatabase } from "@/firebase"
import { useRouter } from "next/navigation"
import { BottomNav } from "@/components/layout/BottomNav"
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
  Shield
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useToast } from "@/hooks/use-toast"
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
  photoURL: string
  matchFlowId?: string
  isVerified?: boolean
  onboardingComplete?: boolean
  isAdmin?: boolean
  isCoinSeller?: boolean
  isAgent?: boolean
  gender?: string
  agencyId?: string
  agencyStatus?: 'pending' | 'approved' | 'rejected' | string
}

function JoinAgencyDialog({ userUid }: { userUid: string }) {
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const { toast } = useToast()

  const handleJoin = async () => {
    if (code.length !== 5) return
    setLoading(true)
    const res = await joinAgencyAction(userUid, code)
    if (res.success) {
      toast({ title: "Success", description: "Application sent to agent!" })
      setOpen(false)
    } else {
      toast({ variant: "destructive", title: "Error", description: res.error })
    }
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-20 bg-pink-500 hover:bg-pink-600 rounded-2xl border-none shadow-xl flex flex-col items-center justify-center gap-1 text-white active:scale-95 transition-all col-span-2 mt-4">
          <UserPlus className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Join Agency</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-3xl p-8 max-w-[90vw] select-none">
        <DialogHeader className="items-center text-center">
          <DialogTitle className="text-xl font-bold">Enter Agency Code</DialogTitle>
          <DialogDescription className="text-xs font-medium">Ask your agent for their 5-digit code.</DialogDescription>
        </DialogHeader>
        <div className="py-6">
          <Input maxLength={5} placeholder="e.g. 54321" value={code} onChange={(e) => setCode(e.target.value)} className="rounded-2xl h-16 text-center text-2xl font-bold tracking-[0.5em]" />
        </div>
        <Button onClick={handleJoin} disabled={loading || code.length !== 5} className="w-full h-14 bg-pink-500 rounded-full font-bold uppercase tracking-widest">
          {loading ? <Loader2 className="animate-spin" /> : "Apply Now"}
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
    setLoading(true)
    const res = await createAgencyAction(user.uid, agencyName)
    if (res.success) {
      toast({ title: "Agency Created", description: `Your code is ${res.code}` })
    } else {
      toast({ variant: "destructive", title: "Error", description: res.error })
    }
    setLoading(false)
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="h-20 bg-blue-600 hover:bg-blue-700 rounded-2xl border-none shadow-xl flex flex-col items-center justify-center gap-1 text-white active:scale-95 transition-all col-span-2 mt-4">
          <Briefcase className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Agency Center</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-3xl p-8 max-w-[90vw] select-none">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Agency Management</DialogTitle>
        </DialogHeader>
        <div className="py-6 space-y-4">
          {user.agencyId ? (
            <div className="text-center space-y-4">
              <div className="bg-blue-50 p-6 rounded-3xl">
                <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-2">Your Agency Code</p>
                <h3 className="text-4xl font-bold text-blue-600 tracking-[0.2em]">{user.agencyId}</h3>
              </div>
              <Button asChild className="w-full h-14 bg-blue-600 rounded-full font-bold uppercase tracking-widest">
                <Link href="/agency-manage">Manage Members</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Input placeholder="Agency Name" value={agencyName} onChange={(e) => setAgencyName(e.target.value)} className="rounded-2xl h-14" />
              <Button onClick={handleCreate} disabled={loading} className="w-full h-14 bg-blue-600 rounded-full font-bold uppercase tracking-widest">
                {loading ? <Loader2 className="animate-spin" /> : "Create Agency"}
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
  const db = useFirestore()
  const rtdb = useDatabase()
  const { toast } = useToast()
  
  const [copied, setCopied] = useState(false)
  
  const [balances, setBalances] = useState(() => {
    if (typeof window !== 'undefined' && user?.uid) {
      const cached = localStorage.getItem(`balance_cache_${user.uid}`)
      if (cached) return JSON.parse(cached)
    }
    return { coins: 0, diamonds: 0, isVerified: false }
  })

  const profileRef = useMemo(() => user ? doc(db, "users", user.uid) : null, [db, user])
  const { data: profile, loading: profileLoading } = useDoc<UserProfile>(profileRef)

  useEffect(() => {
    if (isInitialized && !authLoading && !user) {
      router.replace("/auth")
    } else if (profile && !profileLoading && !profile.onboardingComplete) {
      router.replace("/onboarding")
    }
  }, [user, authLoading, isInitialized, profile, profileLoading, router])

  useEffect(() => {
    if (!user?.uid) return
    const balanceRef = ref(rtdb, `balances/${user.uid}`)
    const unsubscribe = onValue(balanceRef, (snapshot) => {
      const data = snapshot.val()
      if (data) {
        const newBal = { 
          coins: data.coins || 0, 
          diamonds: data.diamonds || 0,
          isVerified: !!data.isVerified 
        }
        setBalances(newBal)
        localStorage.setItem(`balance_cache_${user.uid}`, JSON.stringify(newBal))
      }
    })
    return () => off(balanceRef, 'value', unsubscribe)
  }, [rtdb, user?.uid])

  const handleCopyId = () => {
    if (profile?.matchFlowId) {
      navigator.clipboard.writeText(profile.matchFlowId)
      setCopied(true)
      toast({ title: "Copied!" })
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (authLoading && !profile) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-screen bg-[#F8F9FA]">
        <Loader2 className="w-8 h-8 animate-spin text-[#00A2FF]" />
      </div>
    )
  }

  if (!user && isInitialized) return null

  const isVerified = balances.isVerified || profile?.isVerified

  return (
    <div className="flex-1 pb-24 bg-[#F8F9FA] min-h-screen relative overflow-x-hidden select-none">
      <div className="absolute top-0 left-0 w-full h-[280px] bg-[#00A2FF] z-0" />
      <div className="relative z-10">
        <header className="relative pt-12 pb-10 px-6 flex flex-col items-center text-center">
          <div className="absolute top-6 right-6">
            <div className="bg-white/20 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/10 shadow-sm flex items-center gap-1.5">
              <span className="text-[9px] font-bold text-white uppercase">
                {profile?.isAdmin ? "SYSTEM ADMIN" : (profile?.isAgent ? "AGENCY AGENT" : (profile?.isCoinSeller ? "COIN SELLER" : "VERIFIED USER"))}
              </span>
            </div>
          </div>
          <div className="relative mb-4">
            <div className="relative w-28 h-28 rounded-full shadow-2xl overflow-hidden bg-muted">
              {profile?.photoURL && <Image src={profile.photoURL} alt={profile.name} fill className="object-cover" priority />}
            </div>
            <button className="absolute bottom-1 right-1 bg-white p-3 rounded-full shadow-xl border border-black/5" onClick={() => router.push('/edit-profile')}>
              <Pencil className="w-4 h-4 text-[#00A2FF]" />
            </button>
          </div>
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <h2 className="text-xl font-bold text-white tracking-tight">{profile?.name || '...'}</h2>
            {(isVerified || profile?.isAdmin) && <BadgeCheck className="w-4 h-4 text-white fill-blue-500" />}
          </div>
          <div className="inline-flex items-center gap-1.5 cursor-pointer" onClick={handleCopyId}>
            <p className="text-white/70 font-semibold text-[9px] uppercase">ID: {profile?.matchFlowId}</p>
            {copied ? <Check className="w-2.5 h-2.5 text-green-300" /> : <Copy className="w-2.5 h-2.5 text-white/50" />}
          </div>
        </header>

        <main className="px-6 space-y-6">
          <div className="grid grid-cols-2 gap-4 relative z-20 -mt-6">
            <Button className="h-20 bg-white hover:bg-gray-50 rounded-2xl border-none shadow-xl flex flex-col items-center justify-center gap-1 text-[#00A2FF]" onClick={() => router.push("/recharge")}>
              <div className="flex items-center gap-1.5">
                <CircleDollarSign className="w-5 h-5" />
                <span className="text-sm font-bold">{balances.coins}</span>
              </div>
              <span className="text-[8px] font-bold uppercase opacity-60">Recharge</span>
            </Button>
            <Button className="h-20 bg-white hover:bg-gray-50 rounded-2xl border-none shadow-xl flex flex-col items-center justify-center gap-1 text-black" onClick={() => router.push("/income")}>
              <div className="flex items-center gap-1.5">
                <Gem className="w-5 h-5 text-[#4285F4]" />
                <span className="text-sm font-bold">{balances.diamonds.toFixed(0)}</span>
              </div>
              <span className="text-[8px] font-bold uppercase opacity-60">Diamond Balance</span>
            </Button>

            {!isVerified && !profile?.isAdmin && (
              <Button onClick={() => router.push("/verify-identity")} className="h-20 bg-white hover:bg-gray-50 rounded-2xl border-none shadow-xl flex flex-col items-center justify-center gap-1 text-indigo-600 active:scale-95 transition-all col-span-2 mt-4">
                <div className="flex items-center gap-2"><Shield className="w-6 h-6" /><span className="text-sm font-bold uppercase tracking-widest">Verify Identity</span></div>
              </Button>
            )}

            {profile?.isAdmin || profile?.isCoinSeller ? (
              <Button onClick={() => router.push("/award-coins")} className="h-20 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-2xl border-none shadow-xl flex flex-col items-center justify-center gap-1 text-white active:scale-95 transition-all col-span-2 mt-4">
                <div className="flex items-center gap-2"><Trophy className="w-6 h-6" /><span className="text-sm font-bold uppercase tracking-widest">Award Coins Tool</span></div>
              </Button>
            ) : null}
            {profile?.isAdmin && (
              <Button onClick={() => router.push("/manage-roles")} className="h-20 bg-white hover:bg-gray-50 rounded-2xl border-none shadow-xl flex flex-col items-center justify-center gap-1 text-purple-600 active:scale-95 transition-all col-span-2 mt-4">
                <div className="flex items-center gap-2"><Users className="w-6 h-6" /><span className="text-sm font-bold uppercase tracking-widest">Manage Roles</span></div>
              </Button>
            )}
            {profile?.isAgent && profile && <AgencyDashboardDialog user={profile} />}
            {profile?.gender === 'female' && profile?.agencyStatus !== 'approved' && !profile?.isAgent && !profile?.isAdmin && <JoinAgencyDialog userUid={user?.uid || ""} />}
            {profile?.agencyStatus === 'approved' && (
              <Button onClick={() => router.push("/agency-wallet")} className="h-24 bg-gradient-to-br from-indigo-700 via-blue-600 to-blue-500 rounded-[2.2rem] border-none shadow-2xl flex flex-col items-center justify-center gap-1.5 text-white active:scale-95 transition-all col-span-2 mt-4 relative overflow-hidden group">
                <div className="flex items-center gap-4 relative z-10">
                  <div className="bg-white/15 p-3 rounded-2xl backdrop-blur-md border border-white/10"><Wallet className="w-7 h-7 text-white" /></div>
                  <div className="flex flex-col items-start"><span className="text-base font-black uppercase tracking-widest">Agency Wallet</span></div>
                </div>
              </Button>
            )}
            {profile?.agencyStatus === 'pending' && <div className="col-span-2 bg-yellow-50 p-4 rounded-2xl border border-yellow-100 text-center"><p className="text-[10px] font-bold text-yellow-600 uppercase tracking-widest">Agency Application Pending</p></div>}
          </div>
          <div className="bg-white rounded-3xl p-2 shadow-sm border border-black/5 overflow-hidden">
            <div className="flex flex-col">
              <Button variant="ghost" className="h-16 justify-between px-5 rounded-none" asChild><Link href="/support"><div className="flex items-center gap-4"><div className="bg-blue-50 p-2.5 rounded-xl"><Headphones className="w-5 h-5 text-blue-600" /></div><span className="font-semibold text-xs text-black">Support Center</span></div><ChevronRight className="w-4 h-4 text-gray-300" /></Link></Button>
              <Button variant="ghost" className="h-16 justify-between px-5 rounded-none" asChild><Link href="/settings"><div className="flex items-center gap-4"><div className="bg-gray-50 p-2.5 rounded-xl"><Settings className="w-5 h-5 text-gray-600" /></div><span className="font-semibold text-xs text-black">App Settings</span></div><ChevronRight className="w-4 h-4 text-gray-300" /></Link></Button>
            </div>
          </div>
        </main>
      </div>
      <BottomNav />
    </div>
  )
}
