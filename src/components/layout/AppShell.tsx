
"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { BottomNav } from "./BottomNav"
import { Suspense, useRef, useEffect, useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import { useUser } from "@/firebase/auth/use-user"

/**
 * @fileOverview Viewport-Centric App Shell with Scroll Persistence.
 * Strictly manages hydration state and route-based scroll caching.
 */

function ShellContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { user } = useUser()
  const mainRef = useRef<HTMLElement>(null)
  
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  const isChatDetail = pathname === '/chats' && searchParams.has('startWith')
  const showNav = useMemo(() => {
    if (!mounted || !user) return false;
    const navRoutes = ['/home', '/chats', '/profile'];
    return navRoutes.includes(pathname || "") && !isChatDetail;
  }, [mounted, user, pathname, isChatDetail]);

  // RESTORE SCROLL ON ROUTE CHANGE
  useEffect(() => {
    if (mainRef.current && mounted && pathname) {
      const cacheKey = `scroll_pos_${pathname}`;
      const saved = sessionStorage.getItem(cacheKey);
      if (saved) {
        // Small delay to ensure content has rendered
        const timer = setTimeout(() => {
          if (mainRef.current) mainRef.current.scrollTop = parseInt(saved);
        }, 30);
        return () => clearTimeout(timer);
      } else {
        mainRef.current.scrollTop = 0;
      }
    }
  }, [pathname, mounted])

  // CAPTURE SCROLL ON SCROLLING
  useEffect(() => {
    const currentMain = mainRef.current;
    if (!currentMain || !pathname) return;
    
    const handleScroll = () => {
      const cacheKey = `scroll_pos_${pathname}`;
      sessionStorage.setItem(cacheKey, currentMain.scrollTop.toString());
    }

    currentMain.addEventListener('scroll', handleScroll, { passive: true });
    return () => currentMain.removeEventListener('scroll', handleScroll);
  }, [pathname])

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-white relative">
      <main 
        ref={mainRef}
        className={cn(
          "flex-1 w-full overflow-y-auto overflow-x-hidden relative z-0 no-scrollbar flex flex-col",
          mounted && showNav ? "pb-16" : "pb-0"
        )}
      >
        <div className={cn("flex-1 flex flex-col", !mounted && "invisible")}>
           {children}
        </div>
      </main>
      
      {mounted && showNav && <BottomNav />}
    </div>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="flex-1 bg-white h-screen" />}>
      <ShellContent>
        {children}
      </ShellContent>
    </Suspense>
  )
}
