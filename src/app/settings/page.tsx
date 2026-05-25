"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ChevronLeft, ChevronRight, ShieldAlert, Info, RefreshCw, CreditCard, LogOut, Trash2, Loader2, Ban } from "lucide-react"
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

interface SettingItemProps {
  label: string
  onClick?: () => void
  href?: string
  icon: React.ReactNode
  variant?: 'default' | 'destructive'
}

function SettingItem({ label, onClick, href, icon, variant = 'default' }: SettingItemProps) {
  const content = (
    <div className="flex items-center justify-between py-5 px-6 border-b border-gray-50 active:bg-gray-50 transition-colors cursor-pointer bg-white">
      <div className="flex items-center gap-4">
        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${variant === 'destructive' ? 'bg-red-50' : 'bg-gray-50'}`}>
          {icon}
        </div>
        <span className={`text-[15px] font-bold ${variant === 'destructive' ? 'text-red-500' : 'text-black'}`}>{label}</span>
      </div>
      <ChevronRight className="w-5 h-5 text-gray-300" />
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
      toast({ title: "App Reset", description: "Storage optimized. Reloading..." })
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
        await supabase.auth.signOut();
        window.location.replace("/welcome");
        toast({ title: "Account Deleted", description: "All data and auth records have been removed." });
      } else {
        throw new Error(res.error);
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Deletion failed", description: error.message });
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex-1 bg-[#F9FAFB] flex flex-col min-h-screen select-none">
      <header className="flex items-center justify-between px-4 h-16 bg-white sticky top-0 z-50 border-b shadow-sm">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full">
          <ChevronLeft className="w-6 h-6 text-black" />
        </Button>
        <h1 className="text-sm font-black text-black uppercase tracking-widest">Settings</h1>
        <div className="w-10" />
      </header>

      <main className="flex-1">
        <div className="flex flex-col mt-4">
          <SettingItem label="Charge settings" href="/pricing" icon={<CreditCard className="w-5 h-5 text-blue-500" />} />
          <SettingItem label="Blocked List" href="/blocked-list" icon={<Ban className="w-5 h-5 text-red-400" />} />
          <SettingItem label="About QIVO" href="/about" icon={<Info className="w-5 h-5 text-gray-500" />} />
          <SettingItem label="Clear Cache" onClick={handleClearCache} icon={<RefreshCw className="w-5 h-5 text-orange-500" />} />

          {!loading && !profile?.is_owner && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <div className="flex items-center justify-between py-5 px-6 border-b border-gray-50 active:bg-gray-50 transition-colors cursor-pointer bg-white animate-in fade-in duration-300">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-red-50">
                      <Trash2 className="w-5 h-5 text-red-500" />
                    </div>
                    <span className="text-[15px] font-bold text-red-500">Delete Account</span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-300" />
                </div>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-[2.5rem] max-w-[85vw] p-8 border-none select-none">
                <AlertDialogHeader className="items-center text-center">
                  <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4 mx-auto">
                    <ShieldAlert className="w-8 h-8 text-red-500" />
                  </div>
                  <AlertDialogTitle className="text-xl font-bold">Delete Everything?</AlertDialogTitle>
                  <AlertDialogDescription className="text-[10px] font-bold pt-2 uppercase tracking-widest leading-relaxed text-center text-gray-400">
                    This will remove your Auth account, profile, chats, coins, and history from our systems. Type <span className="text-red-600 font-black">DELETE</span> to confirm:
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="py-4">
                  <Input placeholder="Type DELETE" value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} className="rounded-2xl h-14 text-center font-black bg-gray-50 border-gray-100" />
                </div>
                <AlertDialogFooter className="flex flex-row items-center justify-center gap-4 mt-6">
                  <AlertDialogCancel className="flex-1 h-14 rounded-full border-gray-100 bg-gray-50 text-gray-400 font-black uppercase text-[10px] tracking-widest">Cancel</AlertDialogCancel>
                  <AlertDialogAction disabled={deleteConfirmText.toUpperCase() !== "DELETE" || isDeleting} className="flex-1 h-14 rounded-full bg-red-500 text-white font-black uppercase text-[10px] tracking-widest shadow-lg shadow-red-100" onClick={handleDeleteAccount}>
                    {isDeleting ? <Loader2 className="animate-spin w-4 h-4" /> : "Delete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <div className="flex items-center justify-between py-5 px-6 border-b border-gray-50 active:bg-gray-50 transition-colors cursor-pointer bg-white">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-gray-50">
                    <LogOut className="w-5 h-5 text-gray-400" />
                  </div>
                  <span className="text-[15px] font-bold text-black">Sign Out</span>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-300" />
              </div>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-[2.5rem] max-w-[85vw] p-8 border-none select-none">
              <AlertDialogHeader className="items-center text-center">
                <AlertDialogTitle className="text-xl font-bold">Sign Out?</AlertDialogTitle>
              </AlertDialogHeader>
              <AlertDialogFooter className="flex flex-row items-center justify-center gap-4 mt-6">
                <AlertDialogCancel className="flex-1 h-14 rounded-full border-gray-100 bg-gray-50 text-gray-400 font-black uppercase text-[10px] tracking-widest">No</AlertDialogCancel>
                <AlertDialogAction onClick={handleSignOut} className="flex-1 h-14 rounded-full bg-black text-white font-black uppercase text-[10px] tracking-widest shadow-lg">Yes, Logout</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </main>
    </div>
  )
}
