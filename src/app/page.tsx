
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

    // Secure check for onboarding completion
    const checkOnboarding = async () => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('onboarding_complete')
          .eq('uid', user.id)
          .maybeSingle()
        
        if (error) throw error;

        // Explicitly check for data presence
        if (data && data.onboarding_complete) {
          router.replace("/home")
        } else {
          // If no row exists or onboarding is false, send to onboarding
          router.replace("/fastonboard")
        }
      } catch (err) {
        console.error("[Root Logic Error]:", err)
        // Fallback to onboarding if profile check fails (likely a new user)
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
