"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ChevronLeft, ChevronRight, ShieldAlert, Info, RefreshCw, CreditCard, LogOut, Trash2, Loader2, Ban, ShieldCheck, HelpCircle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/firebase/auth/use-user"
import { deleteUserCompletelyAction } from "@/app/actions/matchflow-actions"
import Link from "next/link"
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
import { cn } from "@/lib/utils"

interface SettingItemProps {
  label: string
  onClick?: () => void
  href?: string
  icon: React.ReactNode
  variant?: 'default' | 'destructive'
  hideBorder?: boolean
}

function SettingItem({ label, onClick, href, icon, variant = 'default', hideBorder }: SettingItemProps) {
  const content = (
    <div className={cn(
      "flex items-center justify-between py-5 px-6 active:bg-gray-50 transition-colors cursor-pointer bg-white group",
      !hideBorder && "border-b border-gray-50"
    )}>
      <div className="flex items-center gap-4">
        <div className={cn(
          "w-11 h-11 rounded-2xl flex items-center justify-center group-active:scale-90 transition-transform",
          variant === 'destructive' ? 'bg-red-50 text-red-500' : 'bg-gray-50 text-black'
        )}>
          {icon}
        </div>
        <span className={cn(
          "text-[15px] font-black tracking-tight",
          variant === 'destructive' ? 'text-red-500' : 'text-slate-900'
        )}>{label}</span>
      </div>
      <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center border border-gray-100 opacity-0 group-hover:opacity-100 transition-opacity">
         <ChevronRight className="w-4 h-4 text-gray-300" />
      </div>
    </div>
  )

  if (href) return <Link href={href} className="block">{content}</Link>
  return <div onClick={onClick}>{content}</div>
}

export default function SettingsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { user } = useUser()
  
  const [deleteConfirmText, setDeleteConfirmText] = useState("")
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    if (!user?.id) return
    const fetchProfile = async () => {
      const { data } = await supabase.from('users').select('*').eq('uid', user.id).single()
      setProfile(data)
      setLoading(false)
    }
    fetchProfile()
  }, [user?.id])

  const handleSignOut = async () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      await supabase.auth.signOut()
      window.location.replace("/welcome")
    } catch (error) {
      console.error(error)
    }
  }

  const handleClearCache = async () => {
    try {
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        if (!key.includes('auth-token')) {
          localStorage.removeItem(key);
        }
      }
      sessionStorage.clear()
      toast({ title: "App refreshed", description: "Storage cleared successfully." })
      setTimeout(() => window.location.reload(), 1000)
    } catch (err) {
      toast({ variant: "destructive", title: "Error" })
    }
  }

  const handleDeleteAccount = async () => {
    if (!user || deleteConfirmText.toUpperCase() !== "DELETE") return

    setIsDeleting(true)
    try {
      const res = await deleteUserCompletelyAction(user.id);
      if (res.success) {
        localStorage.clear();
        sessionStorage.clear();
        await supabase.auth.signOut();
        window.location.replace("/welcome");
        toast({ title: "Account deleted" });
      } else {
        throw new Error(res.error);
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Deletion failed", description: error.message });
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex-1 bg-[#F8FAFC] flex flex-col min-h-screen select-none">
      <header className="flex items-center justify-between px-6 h-16 bg-white sticky top-0 z-50 border-b shadow-sm">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full bg-gray-50">
          <ChevronLeft className="w-5 h-5 text-black" />
        </Button>
        <h1 className="text-sm font-black text-black uppercase tracking-[0.2em]">Application</h1>
        <div className="w-10" />
      </header>

      <main className="flex-1 p-6 space-y-8 overflow-y-auto no-scrollbar pb-12">
        <div className="space-y-4">
          <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] ml-2">Wallet & Billing</h2>
          <div className="bg-white rounded-[2rem] overflow-hidden border border-gray-100 shadow-sm">
            <SettingItem label="Charge Settings" href="/pricing" icon={<CreditCard className="w-5 h-5" />} hideBorder />
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] ml-2">Privacy & Security</h2>
          <div className="bg-white rounded-[2rem] overflow-hidden border border-gray-100 shadow-sm">
            <SettingItem label="Blocked Users" href="/blocked-list" icon={<Ban className="w-5 h-5" />} />
            <SettingItem label="Clear Local Cache" onClick={handleClearCache} icon={<RefreshCw className="w-5 h-5" />} hideBorder />
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] ml-2">Information</h2>
          <div className="bg-white rounded-[2rem] overflow-hidden border border-gray-100 shadow-sm">
            <SettingItem label="About Qivo" href="/about" icon={<Info className="w-5 h-5" />} />
            <SettingItem label="Safety Center" href="/support" icon={<ShieldCheck className="w-5 h-5" />} hideBorder />
          </div>
        </div>

        <div className="space-y-4 pt-4">
          <div className="bg-white rounded-[2rem] overflow-hidden border border-gray-100 shadow-sm">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <div className="flex items-center justify-between py-5 px-6 active:bg-gray-50 transition-colors cursor-pointer bg-white group border-b border-gray-50">
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-gray-50 text-slate-500 group-active:scale-90 transition-transform">
                      <LogOut className="w-5 h-5" />
                    </div>
                    <span className="text-[15px] font-black tracking-tight text-slate-900">Sign Out</span>
                  </div>
                </div>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-[3rem] p-10 border-none shadow-2xl">
                <AlertDialogHeader className="items-center text-center">
                  <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-6">
                    <LogOut className="w-10 h-10 text-[#00A2FF]" />
                  </div>
                  <AlertDialogTitle className="text-2xl font-black tracking-tight uppercase">Sign Out?</AlertDialogTitle>
                  <AlertDialogDescription className="text-sm font-medium text-gray-400 pt-2">You will need to re-authenticate to access your profile.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex flex-col gap-4 mt-10">
                  <AlertDialogAction onClick={handleSignOut} className="w-full h-16 rounded-2xl bg-black text-white font-black uppercase tracking-widest text-sm shadow-xl">Yes, Sign Out</AlertDialogAction>
                  <AlertDialogCancel className="w-full h-16 rounded-2xl border-none bg-gray-50 text-gray-400 font-black uppercase tracking-widest text-sm">Cancel</AlertDialogCancel>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {!loading && !profile?.is_admin && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <div className="flex items-center justify-between py-5 px-6 active:bg-red-50/10 transition-colors cursor-pointer bg-white group">
                    <div className="flex items-center gap-4">
                      <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-red-50 text-red-500 group-active:scale-90 transition-transform">
                        <Trash2 className="w-5 h-5" />
                      </div>
                      <span className="text-[15px] font-black tracking-tight text-red-500">Delete Account</span>
                    </div>
                  </div>
                </AlertDialogTrigger>
                <AlertDialogContent className="rounded-[3rem] p-10 border-none shadow-2xl">
                  <AlertDialogHeader className="items-center text-center">
                    <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-6">
                      <ShieldAlert className="w-10 h-10 text-red-500" />
                    </div>
                    <AlertDialogTitle className="text-2xl font-black tracking-tight uppercase">Permanently Delete?</AlertDialogTitle>
                    <AlertDialogDescription className="text-[11px] font-black text-gray-400 pt-2 uppercase tracking-[0.2em] leading-relaxed">
                      All coins, diamonds, and history will be lost forever. Type <span className="text-red-600">DELETE</span> to confirm.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="py-8">
                    <Input placeholder="Type DELETE" value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} className="rounded-2xl h-16 text-center font-black bg-gray-50 border-gray-100 text-xl tracking-[0.3em] uppercase" />
                  </div>
                  <AlertDialogFooter className="flex flex-col gap-4">
                    <AlertDialogAction disabled={deleteConfirmText.toUpperCase() !== "DELETE" || isDeleting} className="w-full h-16 rounded-2xl bg-red-500 text-white font-black uppercase tracking-widest text-sm shadow-xl shadow-red-100" onClick={handleDeleteAccount}>
                      {isDeleting ? <Loader2 className="animate-spin w-5 h-5" /> : "Delete Everything"}
                    </AlertDialogAction>
                    <AlertDialogCancel className="w-full h-16 rounded-2xl border-none bg-gray-50 text-gray-400 font-black uppercase tracking-widest text-sm">Cancel</AlertDialogCancel>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        <div className="pt-10 text-center space-y-2 opacity-30">
           <p className="text-[9px] font-black uppercase tracking-[0.5em] text-slate-400">Qivo Native v1.2.1</p>
           <p className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-300">Nairobi, Kenya</p>
        </div>
      </main>
    </div>
  )
}
