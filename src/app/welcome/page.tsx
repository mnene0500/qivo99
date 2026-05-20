
"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Mail, Loader2, AlertCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { signInWithPopup, GoogleAuthProvider } from "firebase/auth"
import { useAuth, useUser } from "@/firebase"
import Link from "next/link"
import { useToast } from "@/hooks/use-toast"

/**
 * @fileOverview Welcome / Auth Entry Page.
 * Optimized to redirect users immediately upon authentication.
 */
export default function WelcomePage() {
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(false)
  
  const auth = useAuth()
  const { user, loading: authLoading, isInitialized } = useUser()
  const router = useRouter()
  const { toast } = useToast()

  useEffect(() => {
    setMounted(true)
  }, [])

  // Auto-redirect if user is logged in
  useEffect(() => {
    if (isInitialized && !authLoading && user) {
      // Send authenticated users to Home. 
      // Home will handle the onboarding check if the profile is missing.
      if (user.isAnonymous) {
        router.replace("/fastonboard")
      } else {
        router.replace("/home")
      }
    }
  }, [user, isInitialized, authLoading, router])

  const handleGoogleLogin = async () => {
    if (!auth) {
      toast({
        variant: "destructive",
        title: "Configuration Error",
        description: "Firebase service is not initialized. Please add environment variables in Vercel."
      });
      return;
    }

    setLoading(true)
    try {
      const provider = new GoogleAuthProvider()
      await signInWithPopup(auth, provider)
      // Redirection is handled by the useEffect above
    } catch (error: any) {
      if (error.code !== 'auth/popup-closed-by-user') {
        toast({
          variant: "destructive",
          title: "Sign-In Error",
          description: error.message || "Failed to authenticate with Google."
        })
      }
    } finally {
      setLoading(false)
    }
  }

  if (!mounted || authLoading || !isInitialized || (user)) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-[#00A2FF]" />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black overflow-hidden select-none">
      <div className="absolute inset-0 z-0 overflow-hidden">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-60"
        >
          <source src="/backgroundvideo.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-transparent" />
      </div>

      <div className="relative z-10 h-full flex flex-col px-8 pt-24 pb-16 justify-between items-center text-center">
        <div className="flex flex-col items-center space-y-6 pt-10">
          <div className="space-y-3">
            <h1 className="text-7xl font-logo font-black text-white drop-shadow-2xl tracking-tight">
              QIVO
            </h1>
          </div>
        </div>

        <div className="w-full max-w-sm space-y-4">
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {!auth && (
              <div className="mb-6 p-4 bg-white/10 backdrop-blur-xl border border-white/10 rounded-2xl flex flex-col items-center gap-2">
                <AlertCircle className="w-6 h-6 text-[#00A2FF]" />
                <p className="text-[10px] font-bold text-white uppercase tracking-widest">Initialization Pending</p>
              </div>
            )}

            <Button 
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
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="currentColor"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                )}
                Continue with Google
              </div>
            </Button>
          </div>

          <div className="pt-8">
            <p className="text-[10px] text-white/30 font-medium px-8 leading-relaxed">
              By entering, you confirm you are 18+ and agree to our{' '}
              <Link href="/terms" className="text-white/50 underline underline-offset-4 decoration-white/20">Terms</Link>
              {' '}and{' '}
              <Link href="/privacy" className="text-white/50 underline underline-offset-4 decoration-white/20">Privacy Policy</Link>.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
