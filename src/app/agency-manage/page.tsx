"use client"

import { useEffect, useState, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/firebase/auth/use-user"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ChevronLeft, Check, X, Loader2, User, Users, Briefcase, Banknote, MessageSquare, Copy, Smartphone } from "lucide-react"
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
  mpesa_number: string
  status: string
  timestamp: number
}

export default function AgencyManagePage() {
  const router = useRouter()
  const { user, isInitialized } = useUser()
  const { toast } = useToast()
  
  const [activeTab, setActiveTab] = useState<'members' | 'withdrawals' | 'recruitment'>('members')
  const [isProcessing, setIsProcessing] = useState(false)
  const [loading, setLoading] = useState(true)
  
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [applicants, setApplicants] = useState<UserProfile[]>([])
  const [members, setMembers] = useState<UserProfile[]>([])
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([])

  const fetchData = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)

    const { data: p } = await supabase.from('users').select('*').eq('uid', user.id).single()
    if (p) {
      setProfile(p)
      const aid = p.agency_id
      if (aid) {
        if (activeTab === 'recruitment') {
          const { data } = await supabase.from('users').select('*').eq('agency_id', aid).eq('agency_status', 'pending')
          setApplicants(data || [])
        } else if (activeTab === 'members') {
          const { data } = await supabase.from('users').select('*').eq('agency_id', aid).eq('agency_status', 'approved').limit(100)
          setMembers(data || [])
        } else if (activeTab === 'withdrawals') {
          const { data } = await supabase.from('withdrawals').select('*').eq('agency_id', aid).eq('status', 'pending').order('timestamp', { ascending: false }).limit(50)
          setWithdrawals(data as any || [])
        }
      }
    }
    setLoading(false)
  }, [user?.id, activeTab])

  useEffect(() => {
    if (isInitialized && user?.id) {
      fetchData()
    }
  }, [activeTab, isInitialized, user?.id, fetchData])

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast({ title: `${label} Copied` })
  }

  const handleReview = async (applicantUid: string, status: 'approved' | 'rejected') => {
    if (!user) return
    setIsProcessing(true)
    try {
      const res = await reviewRecruitmentAction(applicantUid, status)
      if (res.success) {
        toast({ title: status === 'approved' ? "Member Approved" : "Applicant Rejected" })
        setApplicants(prev => prev.filter(a => a.uid !== applicantUid))
      } else {
        toast({ variant: "destructive", title: "Error", description: res.error })
      }
    } catch (e) {
      toast({ variant: "destructive", title: "System Error" })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleWithdrawalReview = async (requestId: string, status: 'paid' | 'rejected') => {
    if (!user || !profile?.agency_id) return
    setIsProcessing(true)
    try {
      const res = await updateWithdrawalStatusAction(requestId, status)
      if (res.success) {
        toast({ title: `Payout marked as ${status}` })
        setWithdrawals(prev => prev.filter(w => w.id !== requestId))
      } else {
        toast({ variant: "destructive", title: "Error", description: res.error })
      }
    } catch (e) {
      toast({ variant: "destructive", title: "System Error" })
    } finally {
      setIsProcessing(false)
    }
  }

  if (loading) return <div className="flex-1 flex items-center justify-center min-h-screen bg-white"><Loader2 className="animate-spin text-[#00A2FF] w-8 h-8" /></div>

  return (
    <div className="flex-1 bg-white min-h-screen flex flex-col select-none animate-in fade-in duration-300">
      <header className="px-4 h-16 flex items-center justify-between border-b bg-white sticky top-0 z-50">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full active:scale-90 transition-transform"><ChevronLeft className="w-6 h-6 text-black" /></Button>
        <h1 className="text-sm font-black text-black uppercase tracking-[0.2em]">Agency Center</h1>
        <div className="w-10" />
      </header>

      <div className="flex border-b sticky top-16 bg-white z-40">
        {[
          { id: 'members', label: 'Members', icon: Users }, 
          { id: 'withdrawals', label: 'Payouts', icon: Banknote }, 
          { id: 'recruitment', label: 'Requests', icon: Briefcase }
        ].map((tab) => (
          <button 
            key={tab.id} 
            onClick={() => setActiveTab(tab.id as any)} 
            className={cn(
              "flex-1 py-4 flex flex-col items-center gap-1 border-b-2 transition-all", 
              activeTab === tab.id ? "border-[#00A2FF] text-[#00A2FF]" : "border-transparent text-gray-300"
            )}
          >
            <tab.icon className="w-4 h-4" />
            <span className="text-[9px] font-black uppercase tracking-widest">{tab.label}</span>
          </button>
        ))}
      </div>

      <main className="flex-1 p-6 pb-20">
        {activeTab === 'recruitment' && (
          <div className="space-y-4">
            {applicants.length === 0 ? (
              <div className="py-32 text-center opacity-30 px-12 text-center space-y-4">
                 <Briefcase className="w-12 h-12 mx-auto text-gray-300" />
                 <p className="font-black text-[10px] uppercase tracking-widest">No Applications</p>
              </div>
            ) : applicants.map(app => (
              <div key={app.uid} className="flex items-center justify-between p-5 bg-gray-50 rounded-[2rem] animate-in slide-in-from-right-4">
                <div className="flex items-center gap-3">
                  <Avatar className="w-12 h-12 border-2 border-white shadow-sm"><AvatarImage src={app.photo_url} className="object-cover"/><AvatarFallback><User /></AvatarFallback></Avatar>
                  <span className="font-black text-sm text-black">{app.name}</span>
                </div>
                <div className="flex gap-2">
                  <Button size="icon" disabled={isProcessing} onClick={() => handleReview(app.uid, 'approved')} className="bg-black text-white rounded-full h-10 w-10 shadow-lg active:scale-90 transition-transform"><Check className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" disabled={isProcessing} onClick={() => handleReview(app.uid, 'rejected')} className="text-red-500 rounded-full h-10 w-10 active:scale-90 transition-transform"><X className="w-4 h-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'members' && (
          <div className="space-y-6">
            <div className="space-y-3">
              <h2 className="text-[9px] font-black uppercase text-gray-400 tracking-[0.3em] ml-2">Agency Agent</h2>
              <div className="flex items-center gap-4 p-5 bg-[#00A2FF]/5 border border-[#00A2FF]/10 rounded-[2rem] shadow-sm">
                <Avatar className="w-14 h-14 border-4 border-white shadow-md">
                  <AvatarImage src={profile?.photo_url} className="object-cover" />
                  <AvatarFallback><User /></AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <span className="font-black text-sm block text-slate-900 tracking-tight">{profile?.name} (You)</span>
                  <span className="text-[8px] font-black text-[#00A2FF] uppercase tracking-[0.2em] bg-white px-2 py-0.5 rounded-full border border-[#00A2FF]/10 inline-block mt-1">Owner</span>
                </div>
              </div>
            </div>
            
            <div className="space-y-3">
              <h2 className="text-[9px] font-black uppercase text-gray-400 tracking-[0.3em] ml-2">Active Team</h2>
              <div className="space-y-3">
                {members.length === 0 ? (
                  <div className="py-20 text-center opacity-30 text-[10px] font-black uppercase tracking-widest">No active members</div>
                ) : (
                  members.map(member => (
                    <div key={member.uid} className="flex items-center justify-between p-5 bg-white border rounded-[2rem] shadow-sm">
                      <div className="flex items-center gap-4">
                        <Avatar className="w-12 h-12 border border-slate-100 shadow-sm">
                          <AvatarImage src={member.photo_url} className="object-cover" />
                          <AvatarFallback><User /></AvatarFallback>
                        </Avatar>
                        <span className="font-black text-sm text-slate-900 tracking-tight">{member.name}</span>
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => router.push(`/chats?startWith=${member.uid}`)} className="rounded-full bg-slate-50 text-[#00A2FF] h-10 w-10 active:scale-90 transition-transform">
                        <MessageSquare className="w-4 h-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'withdrawals' && (
          <div className="space-y-4">
            {withdrawals.length === 0 ? (
              <div className="py-32 text-center opacity-30 px-12 text-center space-y-4">
                 <Banknote className="w-12 h-12 mx-auto text-gray-300" />
                 <p className="font-black text-[10px] uppercase tracking-widest">No Pending Payouts</p>
              </div>
            ) : withdrawals.map(req => (
              <div key={req.id} className="p-6 bg-white border rounded-[2.5rem] shadow-xl space-y-6 animate-in slide-in-from-bottom-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-black text-xs uppercase tracking-widest text-slate-400 mb-1">Requester UID</h4>
                    <p className="font-black text-sm text-black font-mono tracking-tighter">#{req.user_id.slice(0, 8).toUpperCase()}</p>
                    <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest mt-2">{format(new Date(Number(req.timestamp)), "MMM d, HH:mm")}</p>
                  </div>
                  <div className="text-right cursor-pointer" onClick={() => handleCopy(req.amount_kes.toString(), "Amount")}>
                    <p className="text-2xl font-black text-green-600 tracking-tighter">Ksh {req.amount_kes}</p>
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-1">{req.diamonds} Diamonds</p>
                  </div>
                </div>
                
                <div className="p-5 bg-gray-50 rounded-2xl border border-black/[0.03] flex items-center justify-between cursor-pointer active:bg-gray-100 transition-colors" onClick={() => handleCopy(req.mpesa_number, "M-Pesa Number")}>
                  <div>
                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1.5"><Smartphone className="w-2.5 h-2.5" /> Destination M-Pesa</p>
                    <p className="text-lg font-black text-black tracking-[0.1em]">{req.mpesa_number || "---"}</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-[#00A2FF] shadow-sm"><Copy className="w-4 h-4" /></div>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button disabled={isProcessing} onClick={() => handleWithdrawalReview(req.id, 'paid')} className="flex-1 bg-black text-white font-black h-14 rounded-2xl uppercase tracking-widest text-[10px] shadow-lg active:scale-95 transition-all">Confirm Payment</Button>
                  <Button disabled={isProcessing} onClick={() => handleWithdrawalReview(req.id, 'rejected')} variant="ghost" className="flex-1 text-red-500 font-black h-14 rounded-2xl uppercase tracking-widest text-[10px] hover:bg-red-50 active:scale-95 transition-all">Reject</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
