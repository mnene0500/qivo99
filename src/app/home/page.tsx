"use client"

import { useMemo, useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { BottomNav } from "@/components/layout/BottomNav"
import { Target, RotateCw, FileText, BadgeCheck, Loader2 } from "lucide-react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { useUser } from "@/firebase/auth/use-user"

interface UserProfile {
  uid: string
  name: string
  photo_url: string
  country: string
  gender: string
  dob: string
  onboarding_complete: boolean
  is_verified?: boolean
}

let globalUserCache: UserProfile[] = [];
let globalScrollY = 0;

function calculateAge(dob: string) {
  if (!dob) return 22
  const birthDate = new Date(dob)
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const m = today.getMonth() - birthDate.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--
  return age
}

export default function HomePage() {
  const router = useRouter()
  const { user: currentUser, loading: authLoading, isInitialized } = useUser()
  
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [users, setUsers] = useState<UserProfile[]>(globalUserCache)
  const [initialLoading, setInitialLoading] = useState(globalUserCache.length === 0)
  const [activeTab, setActiveTab] = useState<'Recommend' | 'Nearby'>('Recommend')
  const [profile, setProfile] = useState<UserProfile | null>(null)

  useEffect(() => {
    if (!isInitialized || authLoading) return;

    if (!currentUser) {
      router.replace("/welcome")
      return;
    }

    const checkProfile = async () => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('uid', currentUser.id)
          .maybeSingle();

        if (error || !data) {
          console.warn("Profile not found, redirecting to onboarding.");
          router.replace("/fastonboard");
          return;
        }

        setProfile(data);
        if (!data.onboarding_complete) {
          router.replace("/fastonboard");
        }
      } catch (err) {
        console.error("Home profile check failed:", err);
        router.replace("/fastonboard");
      }
    };

    checkProfile();
  }, [isInitialized, currentUser, authLoading, router])

  useEffect(() => {
    if (!initialLoading) {
       setTimeout(() => window.scrollTo(0, globalScrollY), 50);
    }
    const handleScroll = () => { globalScrollY = window.scrollY }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [initialLoading])

  const fetchUsers = useCallback(async (isManual = false) => {
    if (isManual) { 
      setIsRefreshing(true); 
      globalScrollY = 0; 
    } else if (users.length === 0) {
      setInitialLoading(true);
    }

    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('onboarding_complete', true)
        .limit(60);

      if (data) {
        const filtered = data.filter(u => u.uid !== currentUser?.id)
        const shuffled = filtered.sort(() => Math.random() - 0.5)
        setUsers(shuffled)
        globalUserCache = shuffled
      }
    } catch (err) {
      console.error("Discovery fetch failed:", err);
    } finally {
      setIsRefreshing(false)
      setInitialLoading(false)
    }
  }, [currentUser?.id, users.length])

  useEffect(() => {
    if (isInitialized && currentUser && users.length === 0) {
      fetchUsers()
    }
  }, [isInitialized, currentUser, users.length, fetchUsers])

  const filteredUsers = useMemo(() => {
    if (activeTab === 'Nearby' && profile) return users.filter(u => u.country === profile.country)
    return users
  }, [users, activeTab, profile])

  if ((initialLoading && users.length === 0) || authLoading || !isInitialized) {
    return (
      <div className="flex-1 bg-white min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-[#00A2FF] w-8 h-8" />
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">Syncing Feed...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 pb-24 bg-[#F9FAFB] min-h-screen relative select-none">
      <div className="absolute top-0 left-0 right-0 z-0 flex flex-col">
        <div className="h-[72px] bg-[#00A2FF]" /><div className="h-[120px] bg-white shadow-sm" />
      </div>
      <div className="relative z-10">
        <div className="px-4 pt-4 pb-2">
          <div className="grid grid-cols-2 gap-4">
            <div onClick={() => router.push('/mystery-note')} className="bg-gradient-to-br from-[#00A2FF] to-[#0081CC] p-4 flex flex-col justify-between h-28 rounded-2xl shadow-lg cursor-pointer active:scale-95 transition-transform"><FileText className="w-5 h-5 text-white" /><h3 className="text-white font-semibold text-sm">Mystery Note</h3></div>
            <div onClick={() => router.push('/tasks')} className="bg-gradient-to-br from-[#A88CFF] to-[#7B61FF] p-4 flex flex-col justify-between h-28 rounded-2xl shadow-lg cursor-pointer active:scale-95 transition-transform"><Target className="w-5 h-5 text-white" /><h3 className="text-white font-semibold text-sm">Task Center</h3></div>
          </div>
        </div>
        <div className="sticky top-0 z-40 bg-[#F9FAFB]/90 backdrop-blur-md px-5 pt-3 pb-3 border-b border-black/5 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <button onClick={() => setActiveTab('Recommend')} className={cn("text-sm font-semibold", activeTab === 'Recommend' ? "text-[#00A2FF]" : "text-gray-400")}>Recommend</button>
            <button onClick={() => setActiveTab('Nearby')} className={cn("text-sm font-semibold", activeTab === 'Nearby' ? "text-[#00A2FF]" : "text-gray-400")}>Nearby</button>
          </div>
          <button onClick={() => fetchUsers(true)} disabled={isRefreshing} className={cn("p-1.5 text-[#00A2FF]", isRefreshing && "animate-spin")}><RotateCw className="w-5 h-5" /></button>
        </div>
        <main className="px-4 pt-3">
          {filteredUsers.length === 0 && !initialLoading ? (
            <div className="py-20 text-center space-y-4 opacity-40">
               <RotateCw className="w-10 h-10 mx-auto text-gray-300" />
               <p className="text-[10px] font-black uppercase tracking-widest">No users found</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {filteredUsers.map((u) => (
                <Card key={u.uid} className="relative overflow-hidden border-none aspect-[1/1.2] rounded-2xl shadow-xl bg-white" onClick={() => router.push(`/users/${u.uid}`)}>
                  <Image src={u.photo_url || ""} alt={u.name} fill className="object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-90" />
                  <div className="absolute inset-x-0 bottom-0 p-3 text-white">
                    <div className="flex items-center gap-1.5"><h4 className="font-bold text-sm truncate">{u.name}</h4>{u.is_verified && <BadgeCheck className="w-4 h-4 text-[#00A2FF] fill-white" />}</div>
                    <div className="flex items-center gap-1.5 mt-1"><span className="bg-[#006400] text-white font-bold text-[10px] px-2 py-0.5 rounded-full">{calculateAge(u.dob)}</span><span className="text-white/60 text-[10px]">{u.country}</span></div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </main>
      </div>
      <BottomNav />
    </div>
  )
}
