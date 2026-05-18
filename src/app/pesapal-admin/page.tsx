"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useUser, useDoc, useFirestore } from "@/firebase"
import { doc } from "firebase/firestore"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ShieldCheck, Loader2, RefreshCw, AlertCircle, Copy, Check, ExternalLink } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

/**
 * @fileOverview QIVO PesaPal Admin Dashboard.
 * Allows administrators to run live diagnostics and retrieve the PESAPAL_IPN_ID.
 */
export default function PesaPalAdminPage() {
  const router = useRouter()
  const { user } = useUser()
  const db = useFirestore()
  const { toast } = useToast()
  
  const [diagnostics, setDiagnostics] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const { data: profile } = useDoc<any>(user?.uid ? doc(db, "users", user.uid) : null)

  const runDiagnostics = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/pesapal/setup')
      const data = await response.json()
      setDiagnostics(data)
    } catch (error) {
      toast({ variant: "destructive", title: "Diagnostic Error", description: "Failed to connect to setup API." })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (profile && !profile.isAdmin) {
      toast({ title: "Access Denied", description: "Admin privileges required." })
      router.push("/home")
    }
  }, [profile, router, toast])

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    toast({ title: "Copied to clipboard" })
    setTimeout(() => setCopied(false), 2000)
  }

  if (!profile?.isAdmin) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-[#00A2FF]" />
      </div>
    )
  }

  return (
    <div className="flex-1 bg-white min-h-screen flex flex-col select-none">
      <header className="px-4 h-16 flex items-center justify-between border-b bg-white sticky top-0 z-50">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full">
          <ChevronLeft className="w-6 h-6 text-black" />
        </Button>
        <h1 className="text-sm font-black text-black uppercase tracking-widest">PesaPal Live Setup</h1>
        <div className="w-10" />
      </header>

      <main className="flex-1 p-6 space-y-8">
        <div className="bg-blue-50 p-6 rounded-[2rem] border border-blue-100 flex items-start gap-4 shadow-sm">
          <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm shrink-0">
            <ShieldCheck className="w-6 h-6 text-[#00A2FF]" />
          </div>
          <div className="space-y-1">
            <h2 className="font-bold text-black">IPN Registration Tool</h2>
            <p className="text-[11px] text-gray-500 font-medium leading-relaxed">
              This tool retrieves the unique <span className="font-bold">IPN ID</span> for your domain from PesaPal. 
              Run this once your app is live at <span className="font-mono">qivo-gamma.vercel.app</span>.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <Button 
            onClick={runDiagnostics} 
            disabled={loading}
            className="w-full h-16 rounded-full bg-[#00A2FF] hover:bg-[#0081CC] text-white font-black uppercase tracking-widest text-xs shadow-xl shadow-blue-100 active:scale-95 transition-all"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4" />
                Run Live Registration
              </div>
            )}
          </Button>

          {diagnostics && (
            <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500 pb-10">
              <div className="p-5 bg-gray-50 rounded-3xl border border-gray-100 space-y-4 shadow-inner">
                <div className="flex justify-between items-center">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Connection Status</p>
                  <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${diagnostics.status === 'Connected' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                    {diagnostics.status}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Callback URL</p>
                  <code className="block p-3 bg-white rounded-xl text-[10px] font-bold text-black border break-all">
                    {diagnostics.target_url}
                  </code>
                </div>

                {diagnostics.recommended_ipn_id && diagnostics.recommended_ipn_id !== "Not found yet - check list below" ? (
                  <div className="space-y-3 pt-2">
                    <p className="text-[10px] font-bold text-[#00A2FF] uppercase tracking-[0.2em]">Step 4: Copy to Vercel Settings</p>
                    <div className="flex gap-2">
                      <code className="flex-1 p-4 bg-white rounded-xl text-xs font-black text-[#00A2FF] border-2 border-[#00A2FF]/20 flex items-center justify-between group cursor-pointer hover:border-[#00A2FF]" onClick={() => copyToClipboard(diagnostics.recommended_ipn_id)}>
                        {diagnostics.recommended_ipn_id}
                        {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 opacity-30 group-hover:opacity-100 transition-opacity" />}
                      </code>
                    </div>
                    <p className="text-[9px] font-medium text-gray-400 italic">
                      Paste this as <span className="font-bold">PESAPAL_IPN_ID</span> in your Environment Variables.
                    </p>
                  </div>
                ) : (
                  <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex items-start gap-3">
                    <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-[10px] font-medium text-amber-700">
                      IPN ID not found. Ensure your consumer keys are correct and the app is public.
                    </p>
                  </div>
                )}
              </div>

              <div className="bg-black text-white p-6 rounded-[2rem] space-y-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#00A2FF]" />
                  <p className="text-[10px] font-black uppercase tracking-widest">Next Steps</p>
                </div>
                <ul className="space-y-3 text-[11px] text-gray-400 list-decimal pl-4">
                  <li>Open your <span className="text-white">Vercel Dashboard</span>.</li>
                  <li>Go to <span className="text-white">Settings > Environment Variables</span>.</li>
                  <li>Add <span className="text-white font-mono">PESAPAL_IPN_ID</span> with the value above.</li>
                  <li>Trigger a <span className="text-white">Redeploy</span> of your main branch.</li>
                </ul>
                <Button variant="outline" className="w-full border-white/20 text-white hover:bg-white/10 rounded-2xl h-12 text-[10px] font-bold uppercase gap-2" onClick={() => window.open('https://vercel.com', '_blank')}>
                  Vercel Dashboard <ExternalLink className="w-3 h-3" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="p-8 text-center opacity-30">
        <p className="text-[9px] font-bold uppercase tracking-[0.3em]">QIVO Payment Authority</p>
      </footer>
    </div>
  )
}
