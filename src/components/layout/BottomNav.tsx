
"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Home, MessageSquare, User } from "lucide-react"
import { cn } from "@/lib/utils"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/firebase/auth/use-user"

/**
 * @fileOverview Strictly Fixed Global Navigation.
 * Includes "Double Tap to Refresh" logic for Home and Chat.
 */
export function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { user } = useUser()
  const [totalUnread, setTotalUnread] = useState(0)

  useEffect(() => {
    if (!user?.id) return
    
    const fetchUnread = async () => {
      const { data } = await supabase
        .from('chats')
        .select('id, last_message_at, last_seen_at, last_sender_id')
        .contains('participant_ids', [user.id])
      
      if (data) {
        const count = data.reduce((acc, chat) => {
          const userSeenAt = (chat.last_seen_at as Record<string, number>)?.[user.id] || 0;
          const lastMsgAt = chat.last_message_at || 0;
          const isUnread = lastMsgAt > userSeenAt && chat.last_sender_id !== user.id;
          return isUnread ? acc + 1 : acc;
        }, 0);
        setTotalUnread(count);
      }
    }

    fetchUnread()
    const channel = supabase.channel('unread-badge-global')
      .on('postgres_changes', { event: '*', table: 'chats' }, () => fetchUnread())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user?.id])

  const handleNavClick = (e: React.MouseEvent, href: string) => {
    if (pathname === href) {
      e.preventDefault();
      // Dispatch custom event to signal refresh/scroll-to-top
      window.dispatchEvent(new CustomEvent('qivo-nav-refresh', { detail: { path: href } }));
    }
  }

  const navItems = [
    { label: "Home", icon: Home, href: "/home" },
    { label: "Chat", icon: MessageSquare, href: "/chats", badge: totalUnread },
    { label: "Me", icon: User, href: "/profile" },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[100] bg-white/95 backdrop-blur-xl border-t h-16 flex items-center justify-around px-2 pb-[env(safe-area-inset-bottom,4px)] shadow-[0_-10px_30px_rgba(0,0,0,0.06)]">
      {navItems.map((item) => {
        const isActive = pathname === item.href
        
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={(e) => handleNavClick(e, item.href)}
            className={cn(
              "flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-all relative",
              isActive ? "text-[#00A2FF]" : "text-gray-300"
            )}
          >
            <div className={cn(
              "relative w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300",
              isActive && "bg-blue-50/50"
            )}>
              <item.icon className={cn("w-5 h-5", isActive ? "text-[#00A2FF] fill-current" : "text-gray-400")} />
              {item.badge !== undefined && item.badge > 0 && (
                <div className="absolute top-0 right-0 bg-red-500 text-white text-[7px] font-bold min-w-[14px] h-3.5 rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                  {item.badge > 9 ? '9+' : item.badge}
                </div>
              )}
            </div>
            <span className={cn("text-[9px] font-bold tracking-tight", isActive ? "opacity-100" : "opacity-60")}>
              {item.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
