
"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/firebase/auth/use-user"
import { Button } from "@/components/ui/button"
import { ChevronLeft, Flag, CheckCircle2, Loader2, User, UserX, Image as ImageIcon, MessageSquareText } from "lucide-react"
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

  const fetchReports = async () => {
    const { data: reportsData } = await supabase
      .from('reports')
      .select('*')
      .eq('status', 'pending')
      .order('timestamp', { ascending: false })

    if (reportsData) {
      const enriched = await Promise.all(reportsData.map(async (r) => {
        const [reporter, reported] = await Promise.all([
          supabase.from('users').select('name, photo_url, match_flow_id').eq('uid', r.reporter_id).single(),
          supabase.from('users').select('name, photo_url, match_flow_id').eq('uid', r.reported_id).single()
        ])
        return {
          ...r,
          reporter_profile: reporter.data,
          reported_profile: reported.data
        }
      }))
      setReports(enriched)
    }
    setLoading(false)
  }

  useEffect(() => {
    if (!user?.id) return
    fetchReports()
    
    const channel = supabase.channel('reports-sync')
      .on('postgres_changes', { event: '*', table: 'reports' }, () => fetchReports())
      .subscribe()
      
    return () => { supabase.removeChannel(channel) }
  }, [user?.id])

  const handleResolve = async (reportId: string, reporterUid: string) => {
    if (!user) return
    setProcessingId(reportId)
    try {
      const res = await resolveReportAction(user.id, reportId, reporterUid)
      if (res.success) {
        toast({ title: "Report Resolved", description: "Reporter notified." })
        setReports(prev => prev.filter(r => r.id !== reportId))
      } else {
        toast({ variant: "destructive", title: "Action Failed", description: res.error })
      }
    } catch (e) {
      toast({ variant: "destructive", title: "System Error" })
    } finally {
      setProcessingId(null)
    }
  }

  return (
    <div className="flex-1 bg-white min-h-screen flex flex-col select-none">
      <header className="px-4 h-16 flex items-center justify-between border-b bg-white sticky top-0 z-50">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full">
          <ChevronLeft className="w-6 h-6 text-black" />
        </Button>
        <h1 className="text-sm font-black text-black uppercase tracking-widest">Report Queue</h1>
        <div className="w-10" />
      </header>

      <main className="flex-1 p-6 overflow-y-auto no-scrollbar">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 opacity-20">
            <Loader2 className="w-8 h-8 animate-spin text-[#00A2FF]" />
            <p className="text-[10px] font-bold uppercase tracking-widest mt-4">Scanning Database...</p>
          </div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center space-y-6 opacity-40">
            <div className="w-20 h-20 bg-green-50 rounded-[2.5rem] flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-green-500" />
            </div>
            <div className="space-y-1">
              <p className="font-black text-sm uppercase tracking-widest">All Clear</p>
              <p className="text-[10px] font-bold text-gray-400">No pending violation reports found.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {reports.map((report) => (
              <div key={report.id} className="p-6 bg-gray-50 rounded-[2.5rem] border border-black/5 space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div className="flex justify-between items-start">
                   <div className="space-y-1">
                      <div className="flex items-center gap-2 px-3 py-1 bg-red-50 text-red-600 rounded-full border border-red-100 w-fit">
                        <Flag className="w-3 h-3 fill-current" />
                        <span className="text-[9px] font-black uppercase tracking-widest">{report.reason}</span>
                      </div>
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest px-1">
                        {format(report.timestamp, "MMM d, HH:mm")}
                      </p>
                   </div>
                   <div className="text-right">
                     <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest">Report ID</p>
                     <p className="text-[10px] font-mono font-bold text-black">#{report.id}</p>
                   </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Reporter</p>
                    <div className="p-3 bg-white rounded-2xl border border-black/5 flex items-center gap-3">
                      <Avatar className="w-8 h-8"><AvatarImage src={report.reporter_profile?.photo_url} /><AvatarFallback><User /></AvatarFallback></Avatar>
                      <div className="min-w-0">
                        <p className="text-xs font-black truncate">{report.reporter_profile?.name}</p>
                        <p className="text-[8px] font-bold text-[#00A2FF] tracking-widest">ID: {report.reporter_profile?.match_flow_id}</p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-[9px] font-black text-red-400 uppercase tracking-widest ml-1">Reported</p>
                    <div className="p-3 bg-white rounded-2xl border border-black/5 flex items-center gap-3 shadow-sm shadow-red-50">
                      <Avatar className="w-8 h-8 border border-red-100"><AvatarImage src={report.reported_profile?.photo_url} /><AvatarFallback><UserX /></AvatarFallback></Avatar>
                      <div className="min-w-0">
                        <p className="text-xs font-black truncate text-red-600">{report.reported_profile?.name}</p>
                        <p className="text-[8px] font-bold text-red-400 tracking-widest">ID: {report.reported_profile?.match_flow_id}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                    <MessageSquareText className="w-3 h-3" /> Explanation
                  </p>
                  <div className="p-4 bg-white rounded-2xl border border-black/5 text-xs font-medium text-gray-700 italic leading-relaxed">
                    "{report.description}"
                  </div>
                </div>

                {report.proof_photo_url && (
                  <div className="space-y-2">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                      <ImageIcon className="w-3 h-3" /> Proof Evidence
                    </p>
                    <div className="relative aspect-video rounded-3xl overflow-hidden shadow-inner border border-black/5 group cursor-zoom-in" onClick={() => window.open(report.proof_photo_url, '_blank')}>
                      <Image src={report.proof_photo_url} alt="Proof" fill className="object-cover group-hover:scale-105 transition-transform duration-500" />
                      <div className="absolute inset-0 bg-black/5" />
                    </div>
                  </div>
                )}

                <Button 
                  onClick={() => handleResolve(report.id, report.reporter_id)}
                  disabled={processingId === report.id}
                  className="w-full h-14 rounded-full bg-black text-white font-black uppercase tracking-[0.2em] text-[10px] shadow-xl active:scale-95 transition-all"
                >
                  {processingId === report.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "Resolve & Notify User"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
