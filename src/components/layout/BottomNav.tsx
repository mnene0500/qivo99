"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, MessageSquare, User } from "lucide-react"
import { cn } from "@/lib/utils"
import { useEffect, useState } from "react"
import { ref, onValue, off } from "firebase/database"
import { useUser, useDatabase } from "@/firebase"

/**
 * @fileOverview High-fidelity Bottom Navigation.
 * Features real-time unread message synchronization and modern neon highlights.
 */
export function BottomNav() {
  const pathname = usePathname()
  const { user } = useUser()
  const rtdb = useDatabase()
  const [totalUnread, setTotalUnread] = useState(0)

  useEffect(() => {
    if (!user?.uid || !rtdb) return
    
    try {
      const unreadRef = ref(rtdb, `user_chats/${user.uid}`)
      const unsubscribe = onValue(unreadRef, (snapshot) => {
        const data = snapshot.val()
        if (data) {
          const total = Object.values(data).reduce((acc: number, val: any) => acc + (Number(val.unreadCount) || 0), 0)
          setTotalUnread(total)
        } else {
          setTotalUnread(0)
        }
      })
      return () => off(unreadRef, 'value', unsubscribe)
    } catch (err) {
      console.warn("[BottomNav] Unread counter failed:", err)
    }
  }, [rtdb, user?.uid])

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
              isActive ? "text-black" : "text-gray-400"
            )}
          >
            <div className={cn(
              "relative p-1.5 rounded-2xl flex items-center justify-center transition-all duration-300",
              isActive && "bg-[#D4FF00] shadow-sm scale-110"
            )}>
              <item.icon className={cn("w-6 h-6", isActive ? "text-black fill-current" : "text-gray-400")} />
              {item.badge !== undefined && item.badge > 0 && (
                <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center border-2 border-white animate-in zoom-in">
                  {item.badge > 9 ? '9+' : item.badge}
                </div>
              )}
            </div>
            <span className={cn("text-[9px] font-black uppercase tracking-tight mt-0.5", isActive ? "text-black opacity-100" : "text-gray-400 opacity-60")}>
              {item.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
