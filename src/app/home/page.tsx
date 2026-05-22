
"use client"

import { useMemo, useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { BottomNav } from "@/components/layout/BottomNav"
import { RotateCw, BadgeCheck, Loader2 } from "lucide-react"
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
  is_deleted?: boolean
}

/**
 * GLOBAL PERSISTENCE CACHE
 */
let globalUserCache: UserProfile[] = [];
let globalScrollY = 0;

function calculateAge(dob: string) {
  if (!dob) return 18
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
  const [statusChecked, setStatusChecked] = useState(false)

  useEffect(() => {
    if (!isInitialized || authLoading) return;
    
    if (!currentUser) { 
      router.replace("/welcome"); 
      return; 
    }

    const checkProfile = async () => {
      const { data } = await supabase
        .from('users')
        .select('onboarding_complete, country, gender')
        .eq('uid', currentUser.id)
        .maybeSingle();
      
      if (!data || !data.onboarding_complete) { 
        router.replace("/fastonboard"); 
        return; 
      }

      setProfile(data as any);
      setStatusChecked(true);
    };

    checkProfile();
  }, [isInitialized, currentUser, authLoading, router])

  useEffect(() => {
    if (!statusChecked) return;
    if (!initialLoading) {
      setTimeout(() => window.scrollTo({ top: globalScrollY, behavior: 'instant' }), 50);
    }
    const handleScroll = () => { globalScrollY = window.scrollY }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [initialLoading, statusChecked])

  const fetchUsers = useCallback(async (isManual = false) => {
    if (!profile?.gender) return;
    
    if (isManual) {
      setIsRefreshing(true);
      globalScrollY = 0;
    } else if (users.length === 0) {
      setInitialLoading(true);
    }

    try {
      const oppositeGender = profile.gender === 'male' ? 'female' : 'male';
      
      const { data } = await supabase
        .from('users')
        .select('uid, name, photo_url, country, dob, is_verified, onboarding_complete, is_deleted, gender')
        .eq('onboarding_complete', true)
        .eq('gender', oppositeGender)
        .or('is_deleted.is.null,is_deleted.eq.false')
        .limit(60);

      if (data) {
        const filtered = (data as UserProfile[]).filter(u => u.uid !== currentUser?.id)
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
  }, [currentUser?.id, profile?.gender, users.length])

  useEffect(() => {
    if (statusChecked && profile && users.length === 0) {
      fetchUsers();
    }
  }, [statusChecked, profile, users.length, fetchUsers])

  const filteredUsers = useMemo(() => {
    if (activeTab === 'Nearby' && profile) return users.filter(u => u.country === profile.country)
    return users
  }, [users, activeTab, profile])

  if (!statusChecked) return <div className="fixed inset-0 bg-white" />

  if (initialLoading && users.length === 0) {
    return (
      <div className="flex-1 bg-white min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-[#00A2FF] w-8 h-8" />
      </div>
    )
  }

  return (
    <div className="flex-1 pb-24 bg-white min-h-screen relative select-none animate-in fade-in duration-300">
      {/* TIGHT HEADER WITH TABS AND REFRESH */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md px-6 pt-4 pb-4 flex items-center justify-between border-b border-gray-50">
        <div className="flex items-center gap-8">
          <button 
            onClick={() => setActiveTab('Recommend')} 
            className={cn(
              "text-lg font-bold transition-all relative", 
              activeTab === 'Recommend' ? "text-[#00A2FF]" : "text-gray-300"
            )}
          >
            Recommend
            {activeTab === 'Recommend' && <div className="absolute -bottom-1 left-0 right-0 h-1 bg-[#00A2FF] rounded-full" />}
          </button>
          <button 
            onClick={() => setActiveTab('Nearby')} 
            className={cn(
              "text-lg font-bold transition-all relative", 
              activeTab === 'Nearby' ? "text-[#00A2FF]" : "text-gray-300"
            )}
          >
            Nearby
            {activeTab === 'Nearby' && <div className="absolute -bottom-1 left-0 right-0 h-1 bg-[#00A2FF] rounded-full" />}
          </button>
        </div>
        <button 
          onClick={() => fetchUsers(true)} 
          disabled={isRefreshing}
          className={cn(
            "p-2 text-[#00A2FF] active:scale-90 transition-transform", 
            isRefreshing && "animate-spin"
          )}
        >
          <RotateCw className="w-6 h-6" />
        </button>
      </header>

      <main className="px-4 pt-4">
        {filteredUsers.length === 0 ? (
          <div className="py-20 text-center opacity-40">
             <RotateCw className="w-10 h-10 mx-auto text-gray-300 mb-4" />
             <p className="text-[10px] font-black uppercase tracking-widest">Finding matches...</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filteredUsers.map((u) => (
              <Card 
                key={u.uid} 
                className="relative overflow-hidden border-none aspect-[1/1.3] rounded-[1.5rem] shadow-md bg-gray-50 group active:scale-95 transition-all cursor-pointer"
                onClick={() => router.push(`/users/${u.uid}`)}
              >
                <Image 
                  src={u.photo_url || `https://picsum.photos/seed/${u.uid}/400/520`} 
                  alt={u.name} 
                  fill 
                  className="object-cover"
                  sizes="(max-width: 768px) 50vw, 25vw"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-90" />
                
                {/* TIGHT CHAT BUTTON AT TOP RIGHT */}
                <div 
                  onClick={(e) => { e.stopPropagation(); router.push(`/chats?startWith=${u.uid}`); }}
                  className="absolute top-2.5 right-2.5 px-4 h-8 bg-[#00A2FF] rounded-full flex items-center justify-center text-white shadow-lg active:scale-90 transition-all z-20"
                >
                  <span className="text-[10px] font-black uppercase tracking-widest">CHAT</span>
                </div>

                <div className="absolute inset-x-0 bottom-0 p-3 text-white">
                  <div className="flex items-center gap-1 mb-2">
                    <h4 className="font-bold text-base truncate">{u.name}</h4>
                    {u.is_verified && <BadgeCheck className="w-4 h-4 text-[#00A2FF] fill-white" />}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-green-600 text-white font-bold text-[10px] px-2 py-0.5 rounded-lg">{calculateAge(u.dob)}</span>
                    <span className="bg-black/30 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded-lg truncate">
                      {u.country}
                    </span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  )
}
