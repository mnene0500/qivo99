
"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { BottomNav } from "./BottomNav"
import { Suspense, useRef, useEffect } from "react"
import { cn } from "@/lib/utils"

/**
 * @fileOverview Viewport-Centric App Shell.
 * Ensures persistent UI (BottomNav) stays fixed while content scrolls independently.
 * Implements Scroll Persistence for main navigation tabs.
 */

// Global scroll cache to persist positions between unmounts
const scrollCache: Record<string, number> = {};

function ShellContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const mainRef = useRef<HTMLElement>(null)
  
  const isChatDetail = pathname === '/chats' && searchParams.has('startWith')
  const isCall = pathname?.startsWith('/call/')
  const isWelcome = pathname === '/welcome'
  const isAuth = pathname === '/auth'
  const isSplash = pathname === '/'
  
  const showNav = ['/home', '/chats', '/profile'].includes(pathname || "") && !isChatDetail && !isCall && !isWelcome && !isAuth && !isSplash

  // RESTORE SCROLL
  useEffect(() => {
    if (mainRef.current) {
      const savedPosition = scrollCache[pathname || ''] || 0;
      mainRef.current.scrollTop = savedPosition;
    }
  }, [pathname])

  // SAVE SCROLL ON LEAVE
  useEffect(() => {
    const handleScroll = () => {
      if (mainRef.current && pathname) {
        scrollCache[pathname] = mainRef.current.scrollTop;
      }
    }

    const currentMain = mainRef.current;
    if (currentMain) {
      currentMain.addEventListener('scroll', handleScroll);
    }
    return () => {
      if (currentMain) {
        currentMain.removeEventListener('scroll', handleScroll);
      }
    }
  }, [pathname])

  // LISTEN FOR GLOBAL REFRESH EVENT (Scroll to Top)
  useEffect(() => {
    const handleRefresh = (e: any) => {
      if (e.detail.path === pathname && mainRef.current) {
        mainRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        scrollCache[pathname] = 0;
      }
    }
    window.addEventListener('qivo-nav-refresh', handleRefresh);
    return () => window.removeEventListener('qivo-nav-refresh', handleRefresh);
  }, [pathname])

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-white">
      <main 
        ref={mainRef}
        className={cn(
          "flex-1 w-full overflow-y-auto overflow-x-hidden relative z-0 no-scrollbar pb-[env(safe-area-inset-bottom)]",
          showNav && "pb-20",
          "native-page-transition"
        )}
      >
        {children}
      </main>
      
      {showNav && <BottomNav />}
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
