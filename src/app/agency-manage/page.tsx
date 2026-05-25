
"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/firebase/auth/use-user"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ChevronLeft, Check, X, Loader2, User, Users, Briefcase, Banknote, MessageSquare } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useToast } from "@/hooks/use-toast"
import { reviewRecruitmentAction, updateWithdrawalStatusAction } from "@/app/actions/matchflow-actions"
import { cn } from "@/lib/utils"
import { format } from "date-fns"

interface UserProfile {
  uid: string
  name: string
  photo_url: string
  agency_id?: string
  agency_status?: string
  is_agent?: boolean
}

interface WithdrawalRequest {
  id: string
  user_id: string
  diamonds: number
  amount_kes: number
  status: string
  timestamp: number
}

export default function AgencyManagePage() {
  const router = useRouter()
  const { user } = useUser()
  const { toast } = useToast()
  
  const [activeTab, setActiveTab] = useState<'members' | 'withdrawals' | 'recruitment'>('members')
  const [isProcessing, setIsProcessing] = useState(false)
  const [loading, setLoading] = useState(true)
  
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [applicants, setApplicants] = useState<UserProfile[]>([])
  const [members, setMembers] = useState<UserProfile[]>([])
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([])

  const fetchData = async () => {
    if (!user?.id) return
    const { data: p } = await supabase.from('users').select('*').eq('uid', user.id).single()
    if (p) {
      setProfile(p)
      const aid = p.agency_id
      if (aid) {
        // Fetch all relevant data for the agency
        const [apps, mems, withs] = await Promise.all([
          supabase.from('users').select('*').eq('agency_id', aid).eq('agency_status', 'pending'),
          supabase.from('users').select('*').eq('agency_id', aid).eq('agency_status', 'approved'),
          supabase.from('withdrawals').select('*').eq('agency_id', aid).eq('status', 'pending').order('timestamp', { ascending: false })
        ])
        
        setApplicants(apps.data || [])
        setMembers(mems.data || [])
        setWithdrawals(withs.data as any || [])
      }
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchData()

    if (!user?.id) return

    // REALTIME: Listen for new agency activity
    const channel = supabase.channel(`agency-center-live`)
      .on('postgres_changes', { event: '*', table: 'users' }, () => fetchData())
      .on('postgres_changes', { event: '*', table: 'withdrawals' }, () => fetchData())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user?.id])

  const handleReview = async (applicantUid: string, status: 'approved' | 'rejected') => {
    if (!user) return
    // FIXED: Passed parameters incorrectly before
    const res = await reviewRecruitmentAction(applicantUid, status)
    if (res.success) {
      toast({ title: status === 'approved' ? "Member Approved" : "Applicant Rejected" })
    }
  }

  const handleWithdrawalReview = async (requestId: string, status: 'paid' | 'rejected') => {
    if (!user || !profile?.agency_id) return
    setIsProcessing(true)
    // FIXED: Passed parameters incorrectly before
    const res = await updateWithdrawalStatusAction(requestId, status)
    if (res.success) {
      toast({ title: `Payout marked as ${status}` })
    }
    setIsProcessing(false)
  }

  if (loading) return <div className="flex-1 flex items-center justify-center bg-white min-h-screen"><Loader2 className="animate-spin text-[#00A2FF]" /></div>

  return (
    <div className="flex-1 bg-white min-h-screen flex flex-col select-none">
      <header className="px-4 h-16 flex items-center justify-between border-b bg-white sticky top-0 z-50">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full"><ChevronLeft className="w-6 h-6 text-black" /></Button>
        <h1 className="text-sm font-black text-black uppercase tracking-widest">Agency Center</h1>
        <div className="w-10" />
      </header>

      <div className="flex border-b sticky top-16 bg-white z-40">
        {[{ id: 'members', label: 'Members', icon: Users }, { id: 'withdrawals', label: 'Payouts', icon: Banknote }, { id: 'recruitment', label: 'Requests', icon: Briefcase }].map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={cn("flex-1 py-4 flex flex-col items-center gap-1 border-b-2 transition-all", activeTab === tab.id ? "border-[#00A2FF] text-[#00A2FF]" : "border-transparent text-gray-400")}>
            <tab.icon className="w-5 h-5" /><span className="text-[10px] font-bold uppercase tracking-tighter">{tab.label}</span>
          </button>
        ))}
      </div>

      <main className="flex-1 p-6">
        {activeTab === 'recruitment' && (
          <div className="space-y-4">
            {applicants.length === 0 ? <div className="p-12 text-center text-gray-300 text-xs font-bold uppercase tracking-widest">No pending applications</div> : applicants.map(app => (
              <div key={app.uid} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl animate-in fade-in slide-in-from-right-4">
                <div className="flex items-center gap-3"><Avatar className="w-10 h-10"><AvatarImage src={app.photo_url} /><AvatarFallback><User /></AvatarFallback></Avatar><span className="font-bold text-sm">{app.name}</span></div>
                <div className="flex gap-2">
                  <Button size="icon" onClick={() => handleReview(app.uid, 'approved')} className="bg-green-500 rounded-full h-9 w-9 shadow-lg shadow-green-100"><Check className="w-4 h-4 text-white" /></Button>
                  <Button size="icon" onClick={() => handleReview(app.uid, 'rejected')} variant="outline" className="border-red-200 text-red-500 rounded-full h-9 w-9"><X className="w-4 h-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'members' && (
          <div className="space-y-4">
            <h2 className="text-[10px] font-bold uppercase text-gray-400 tracking-widest px-1">Agency Agent</h2>
            <div className="flex items-center gap-3 p-4 bg-[#00A2FF]/5 border border-[#00A2FF]/10 rounded-2xl">
              <Avatar className="w-12 h-12 border-2 border-[#00A2FF]"><AvatarImage src={profile?.photo_url} /><AvatarFallback><User /></AvatarFallback></Avatar>
              <div className="flex-1"><span className="font-bold text-sm block">{profile?.name} (You)</span><span className="text-[9px] font-bold text-[#00A2FF] uppercase tracking-widest">Agency Owner</span></div>
            </div>
            <h2 className="text-[10px] font-bold uppercase text-gray-400 tracking-widest px-1 mt-6">Team Members ({members.length})</h2>
            <div className="space-y-3">
              {members.length === 0 ? <div className="p-12 text-center text-gray-300 text-xs font-bold uppercase tracking-widest">No members yet</div> : members.map(member => (
                <div key={member.uid} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-black/5">
                  <div className="flex items-center gap-3"><Avatar className="w-10 h-10 border border-white"><AvatarImage src={member.photo_url} /><AvatarFallback><User /></AvatarFallback></Avatar><span className="font-bold text-sm text-black">{member.name}</span></div>
                  <Button size="icon" variant="ghost" onClick={() => router.push(`/chats?startWith=${member.uid}`)} className="rounded-full bg-white shadow-sm text-[#00A2FF] border border-blue-50"><MessageSquare className="w-4 h-4" /></Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'withdrawals' && (
          <div className="space-y-4">
            {withdrawals.length === 0 ? <div className="p-12 text-center text-gray-300 text-xs font-bold uppercase tracking-widest">No pending payouts</div> : withdrawals.map(req => (
              <div key={req.id} className="p-5 bg-white border rounded-2xl shadow-sm space-y-4 animate-in fade-in slide-in-from-bottom-4">
                <div className="flex justify-between items-start">
                  <div><h4 className="font-bold text-sm">UID: {req.user_id.slice(0, 8)}...</h4><p className="text-[10px] font-bold text-gray-400 uppercase">Requested: {format(req.timestamp, "MMM d, HH:mm")}</p></div>
                  <div className="text-right"><p className="text-lg font-bold text-green-600">Ksh {req.amount_kes}</p><p className="text-[10px] font-bold text-gray-400 uppercase">{req.diamonds} Diamonds</p></div>
                </div>
                <div className="flex gap-2">
                  <Button disabled={isProcessing} onClick={() => handleWithdrawalReview(req.id, 'paid')} className="flex-1 bg-green-600 text-white font-bold h-12 rounded-full uppercase tracking-widest text-[10px] shadow-lg shadow-green-100">Pay User</Button>
                  <Button disabled={isProcessing} onClick={() => handleWithdrawalReview(req.id, 'rejected')} variant="outline" className="flex-1 border-red-200 text-red-500 font-bold h-12 rounded-full uppercase tracking-widest text-[10px]">Reject</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
