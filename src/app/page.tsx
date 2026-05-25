"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/firebase/auth/use-user"

/**
 * Root Redirector / Splash Screen.
 * Displays the cinematic QIVO brand while verifying authentication and onboarding status.
 */
export default function RootPage() {
  const router = useRouter()
  const { user, loading: authLoading, isInitialized } = useUser()

  useEffect(() => {
    if (!isInitialized || authLoading) return

    if (!user) {
      router.replace("/welcome")
      return
    }

    const checkOnboarding = async () => {
      try {
        const { data } = await supabase
          .from('users')
          .select('onboarding_complete')
          .eq('uid', user.id)
          .maybeSingle()
        
        if (data?.onboarding_complete) {
          router.replace("/home")
        } else {
          router.replace("/fastonboard")
        }
      } catch (err) {
        router.replace("/fastonboard")
      }
    }

    checkOnboarding()
  }, [user, isInitialized, authLoading, router])

  return (
    <div className="fixed inset-0 bg-white flex items-center justify-center select-none animate-in fade-in duration-700">
       <h1 className="text-7xl font-logo font-black text-[#00A2FF] tracking-tight">
         QIVO
       </h1>
    </div>
  )
}