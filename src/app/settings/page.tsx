"use client"

import { useRouter } from "next/navigation"
import { useAuth, useUser } from "@/firebase"
import { Button } from "@/components/ui/button"
import { 
  ChevronLeft, 
  User, 
  Shield, 
  Ban, 
  LogOut, 
  ChevronRight, 
  HelpCircle,
  Info,
  Lock
} from "lucide-react"
import { signOut } from "firebase/auth"
import { useToast } from "@/hooks/use-toast"
import Link from "next/link"

export default function SettingsPage() {
  const router = useRouter()
  const auth = useAuth()
  const { user } = useUser()
  const { toast } = useToast()

  const handleLogout = async () => {
    try {
      await signOut(auth)
      toast({ title: "Logged out", description: "See you soon!" })
      router.push("/auth")
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: "Failed to log out" })
    }
  }

  const sections = [
    {
      title: "Account Settings",
      items: [
        { label: "Edit Profile", icon: User, path: "/edit-profile", color: "bg-blue-50 text-blue-600" },
        { label: "Secure Account", icon: Lock, path: "/bind-account", color: "bg-indigo-50 text-indigo-600" },
      ]
    },
    {
      title: "Privacy & Privacy",
      items: [
        { label: "Blocked Users", icon: Ban, path: "/blocked-list", color: "bg-red-50 text-red-600" },
        { label: "Privacy Policy", icon: Shield, path: "/privacy", color: "bg-green-50 text-green-600" },
      ]
    },
    {
      title: "Support",
      items: [
        { label: "About MatchFlow", icon: Info, path: "/about", color: "bg-gray-50 text-gray-600" },
      ]
    }
  ]

  return (
    <div className="flex-1 bg-white min-h-screen flex flex-col select-none">
      <header className="px-4 h-16 flex items-center border-b sticky top-0 bg-white z-50">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full">
          <ChevronLeft className="w-6 h-6 text-black" />
        </Button>
        <h1 className="text-base font-black text-black ml-2 uppercase tracking-tight">App Settings</h1>
      </header>

      <main className="flex-1 p-6 space-y-8">
        {sections.map((section, idx) => (
          <div key={idx} className="space-y-3">
            <h2 className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-1">{section.title}</h2>
            <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm">
              {section.items.map((item, i) => (
                <Link key={i} href={item.path} className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors border-b last:border-none border-gray-50">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-2xl ${item.color} flex items-center justify-center`}>
                      <item.icon className="w-5 h-5" />
                    </div>
                    <span className="text-sm font-bold text-black">{item.label}</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </Link>
              ))}
            </div>
          </div>
        ))}

        <div className="pt-4">
          <Button 
            variant="outline" 
            onClick={handleLogout}
            className="w-full h-16 rounded-3xl border-2 border-red-50 text-red-500 font-black uppercase tracking-widest text-[10px] gap-2 hover:bg-red-50 hover:border-red-100"
          >
            <LogOut className="w-4 h-4" />
            Sign Out of Account
          </Button>
        </div>
      </main>

      <footer className="p-10 text-center opacity-30">
        <p className="text-[10px] font-black text-gray-300 uppercase tracking-[0.2em]">MatchFlow Kenya • v1.2.1</p>
      </footer>
    </div>
  )
}