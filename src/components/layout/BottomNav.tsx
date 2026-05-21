
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, MessageSquare, User } from "lucide-react"
import { cn } from "@/lib/utils"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/firebase/auth/use-user"

/**
 * @fileOverview High-fidelity Bottom Navigation.
 * Features real-time unread message synchronization via Supabase.
 */
export function BottomNav() {
  const pathname = usePathname()
  const { user } = useUser()
  const [totalUnread, setTotalUnread] = useState(0)

  useEffect(() => {
    if (!user?.id) return
    
    const fetchUnread = async () => {
      // Check for presence of any chat where the user is a participant
      const { data } = await supabase
        .from('chats')
        .select('id')
        .contains('participant_ids', [user.id])
      
      if (data) setTotalUnread(data.length > 0 ? 1 : 0)
    }

    fetchUnread()

    const channel = supabase.channel('unread-badge')
      .on('postgres_changes', { event: '*', table: 'chats' }, () => fetchUnread())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user?.id])

  const navItems = [
    { label: "Home", icon: Home, href: "/home" },
    { label: "Chat", icon: MessageSquare, href: "/chats", badge: totalUnread },
    { label: "Me", icon: User, href: "/profile" },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-t h-16 flex items-center justify-around px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_20px_rgba(0,0,0,0.05)]">
      {navItems.map((item) => {
        const isActive = pathname === item.href || (item.href === '/chats' && pathname?.startsWith('/chats'))
        
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-all relative",
              isActive ? "text-[#00A2FF]" : "text-gray-400"
            )}
          >
            <div className={cn(
              "relative p-1.5 rounded-2xl flex items-center justify-center transition-all duration-300",
              isActive && "bg-[#00A2FF] shadow-lg shadow-blue-100 scale-110"
            )}>
              <item.icon className={cn("w-6 h-6", isActive ? "text-white fill-current" : "text-gray-400")} />
              {item.badge !== undefined && item.badge > 0 && (
                <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center border-2 border-white animate-in zoom-in">
                  {item.badge > 9 ? '9+' : item.badge}
                </div>
              )}
            </div>
            <span className={cn("text-[9px] font-black uppercase tracking-tight mt-0.5", isActive ? "text-[#00A2FF] opacity-100" : "text-gray-400 opacity-60")}>
              {item.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
