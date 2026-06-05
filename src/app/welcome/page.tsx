"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Mail, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/firebase/auth/use-user"
import Link from "next/link"
import { useToast } from "@/hooks/use-toast"

/**
 * @fileOverview Cinematic Welcome Page.
 * Uses router.replace() for session handling to keep auth pages out of the back-stack.
 */
export default function WelcomePage() {
  const [loading, setLoading] = useState(false)
  const { user, loading: authLoading, isInitialized } = useUser()
  const router = useRouter()
  const { toast } = useToast()

  useEffect(() => {
    if (isInitialized && !authLoading && user) {
      // Use replace to ensure they can't "back" into the welcome screen
      router.replace("/")
    }
  }, [user, isInitialized, authLoading, router])

  const handleGoogleLogin = async () => {
    setLoading(true)
    try {
      const redirectTo = typeof window !== 'undefined' ? window.location.origin : 'https://qivo-five.vercel.app';
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        }
      })
      if (error) throw error
    } catch (error: any) {
      toast({ variant: "destructive", title: "Sign-In Error", description: error.message })
      setLoading(false)
    }
  }

  if (!isInitialized || (isInitialized && user)) {
    return <div className="fixed inset-0 bg-white" />
  }

  return (
    <div className="fixed inset-0 bg-black overflow-hidden select-none">
      <div className="absolute inset-0 z-0 overflow-hidden">
        <video autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover opacity-60">
          <source src="/backgroundvideo.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
      </div>

      <div className="relative z-10 h-full flex flex-col px-8 pt-24 pb-16 justify-between items-center text-center">
        <div className="flex flex-col items-center space-y-6 pt-10">
          <h1 className="text-7xl font-logo font-black text-white drop-shadow-2xl tracking-tight">QIVO</h1>
        </div>

        <div className="w-full max-sm:max-w-xs space-y-4">
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Button 
              disabled={loading}
              onClick={() => router.push("/auth")}
              className="w-full h-16 rounded-3xl bg-white text-black hover:bg-white/90 font-bold text-sm tracking-widest uppercase shadow-2xl active:scale-95 transition-all"
            >
              <div className="flex items-center justify-center gap-3">
                <Mail className="w-5 h-5" />
                Continue with Email
              </div>
            </Button>

            <Button 
              disabled={loading}
              onClick={handleGoogleLogin}
              variant="ghost"
              className="w-full h-16 rounded-3xl border border-white/20 bg-white/5 backdrop-blur-xl text-white hover:bg-white/10 font-bold text-sm tracking-widest uppercase active:scale-95 transition-all"
            >
              <div className="flex items-center justify-center gap-3">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                )}
                Continue with Google
              </div>
            </Button>
          </div>

          <div className="pt-4">
            <p className="text-[10px] text-white/30 font-medium px-8 leading-relaxed">
              By entering, you confirm you are 18+ and agree to our <Link href="/terms" className="text-white/50 underline">Terms</Link> and <Link href="/privacy" className="text-white/50 underline">Privacy Policy</Link>.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
