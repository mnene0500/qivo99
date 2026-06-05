"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/firebase/auth/use-user"
import { Button } from "@/components/ui/button"
import { ChevronLeft, Flag, CheckCircle2, Loader2, User, UserX } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useToast } from "@/hooks/use-toast"
import { resolveReportAction } from "@/app/actions/matchflow-actions"
import Image from "next/image"
import { format } from "date-fns"

interface Report {
  id: string
  reporter_id: string
  reported_id: string
  reason: string
  description: string
  proof_photo_url: string
  status: string
  timestamp: number
  reporter_profile?: any
  reported_profile?: any
}

export default function ManageReportsPage() {
  const router = useRouter()
  const { user } = useUser()
  const { toast } = useToast()
  
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)

  const fetchReports = useCallback(async () => {
    const { data: reportsData } = await supabase.from('reports').select('*').eq('status', 'pending').order('timestamp', { ascending: false })
    if (reportsData) {
      const enriched = await Promise.all(reportsData.map(async (r) => {
        const [reporter, reported] = await Promise.all([
          supabase.from('users').select('name, photo_url, match_flow_id').eq('uid', r.reporter_id).maybeSingle(),
          supabase.from('users').select('name, photo_url, match_flow_id').eq('uid', r.reported_id).maybeSingle()
        ])
        return { ...r, reporter_profile: reporter?.data || { name: 'Unknown' }, reported_profile: reported?.data || { name: 'Unknown' } }
      }))
      setReports(enriched)
    } else setReports([])
    setLoading(false)
  }, [])

  useEffect(() => { if (user?.id) fetchReports() }, [user?.id, fetchReports])

  const handleResolve = async (reportId: string, reporterUid: string) => {
    if (!user) return
    setProcessingId(reportId)
    try {
      const res = await resolveReportAction(user.id, reportId, reporterUid)
      if (res.success) {
        toast({ title: "Report Resolved" })
        setReports(prev => prev.filter(r => r.id !== reportId))
      }
    } finally { setProcessingId(null) }
  }

  return (
    <div className="flex-1 bg-white min-h-screen flex flex-col select-none">
      <header className="px-4 h-16 flex items-center justify-between border-b bg-white sticky top-0 z-50">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full"><ChevronLeft className="w-6 h-6 text-black" /></Button>
        <h1 className="text-sm font-black text-black uppercase tracking-widest">Report Queue</h1>
        <div className="w-10" />
      </header>

      <main className="flex-1 p-6 overflow-y-auto no-scrollbar pb-20">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 opacity-20"><Loader2 className="w-8 h-8 animate-spin text-[#00A2FF]" /></div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center opacity-40"><div className="w-20 h-20 bg-green-50 rounded-[2rem] flex items-center justify-center mb-6"><CheckCircle2 className="w-10 h-10 text-green-500" /></div><p className="font-black text-sm uppercase tracking-widest">All Clear</p></div>
        ) : (
          <div className="space-y-8">
            {reports.map((report) => (
              <div key={report.id} className="p-6 bg-gray-50 rounded-[2.5rem] border border-black/5 space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div className="flex items-center gap-2 px-3 py-1 bg-red-50 text-red-600 rounded-full border border-red-100 w-fit">
                  <Flag className="w-3 h-3 fill-current" /><span className="text-[9px] font-black uppercase tracking-widest">{report.reason}</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <ReportUserCard label="Reporter" profile={report.reporter_profile} />
                  <ReportUserCard label="Reported" profile={report.reported_profile} isDanger />
                </div>
                <div className="p-4 bg-white rounded-2xl border border-black/5 text-xs font-medium text-gray-700 italic">"{report.description}"</div>
                {report.proof_photo_url && <div className="relative aspect-video rounded-3xl overflow-hidden shadow-inner border border-black/5"><Image src={report.proof_photo_url} alt="Proof" fill className="object-cover" /></div>}
                <Button onClick={() => handleResolve(report.id, report.reporter_id)} disabled={processingId === report.id} className="w-full h-14 rounded-full bg-black text-white font-black uppercase tracking-widest text-[10px] shadow-xl">{processingId === report.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "Resolve & Notify"}</Button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function ReportUserCard({ label, profile, isDanger }: any) {
  return (
    <div className="space-y-2">
      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">{label}</p>
      <div className="p-3 bg-white rounded-2xl border border-black/5 flex items-center gap-3">
        <Avatar className="w-8 h-8"><AvatarImage src={profile?.photo_url} /><AvatarFallback><User /></AvatarFallback></Avatar>
        <div className="min-w-0 flex-1"><p className={cn("text-xs font-black truncate", isDanger && "text-red-600")}>{profile?.name}</p><p className="text-[8px] font-bold text-gray-400">ID: {profile?.match_flow_id || '---'}</p></div>
      </div>
    </div>
  )
}
