
"use client"

import { useMemo, useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { RotateCw, BadgeCheck, Loader2, FileText, Target } from "lucide-react"
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
  blocking?: string[]
  blocked_by?: string[]
  updated_at: string
}

const PAGE_SIZE = 10;

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
  const [users, setUsers] = useState<UserProfile[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'Recommend' | 'Nearby'>('Recommend')
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [statusChecked, setStatusChecked] = useState(false)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  // Scroll Preservation
  useEffect(() => {
    const savedScroll = sessionStorage.getItem('home_scroll_pos');
    if (savedScroll && !initialLoading) {
      window.scrollTo(0, parseInt(savedScroll));
    }
    
    const handleScroll = () => {
      sessionStorage.setItem('home_scroll_pos', window.scrollY.toString());
      if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 800 && !isLoadingMore && hasMore) {
        loadMore();
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [initialLoading, isLoadingMore, hasMore]);

  useEffect(() => {
    if (!isInitialized || authLoading) return;
    if (!currentUser) { router.replace("/welcome"); return; }

    const setupProfile = async () => {
      const { data } = await supabase
        .from('users')
        .select('uid, gender, country, onboarding_complete, blocking, blocked_by')
        .eq('uid', currentUser.id)
        .maybeSingle();
      
      if (!data || !data.onboarding_complete) { 
        router.replace("/fastonboard"); 
        return; 
      }
      setProfile(data as any);
      setStatusChecked(true);
    };

    setupProfile();
  }, [isInitialized, currentUser, authLoading, router])

  const fetchUsers = useCallback(async (pageNum = 0, isManual = false) => {
    if (!profile?.gender) return;
    if (isManual) {
      setIsRefreshing(true);
      setPage(0);
    } else if (pageNum === 0) {
      setInitialLoading(true);
    } else {
      setIsLoadingMore(true);
    }

    try {
      const oppositeGender = profile.gender === 'male' ? 'female' : 'male';
      const from = pageNum * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      // Online Priority logic: Sort by updated_at DESC (active recently)
      // To add randomness on manual refresh, we could offset by a random page if we had thousands of users,
      // but for standard efficiency we stick to updated_at + simple range.
      const query = supabase
        .from('users')
        .select('uid, name, photo_url, country, dob, is_verified, updated_at')
        .eq('onboarding_complete', true)
        .eq('gender', oppositeGender)
        .is('is_deleted', false)
        .order('updated_at', { ascending: false })
        .range(from, to);

      if (activeTab === 'Nearby') {
        query.eq('country', profile.country);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (data) {
        const blockedUids = new Set([...(profile.blocking || []), ...(profile.blocked_by || [])]);
        const filtered = (data as UserProfile[]).filter(u => u.uid !== currentUser?.id && !blockedUids.has(u.uid));
        
        if (pageNum === 0) {
          setUsers(filtered);
        } else {
          setUsers(prev => [...prev, ...filtered]);
        }
        setHasMore(data.length === PAGE_SIZE);
      }
    } catch (err) {
      console.error("[Home Fetch Error]:", err);
    } finally {
      setIsRefreshing(false);
      setInitialLoading(false);
      setIsLoadingMore(false);
    }
  }, [currentUser?.id, profile, activeTab]);

  useEffect(() => {
    if (statusChecked && profile && users.length === 0) {
      fetchUsers(0);
    }
  }, [statusChecked, profile, activeTab, fetchUsers, users.length]);

  const loadMore = () => {
    if (isLoadingMore || !hasMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchUsers(nextPage);
  };

  const handleManualRefresh = () => {
    setPage(0);
    fetchUsers(0, true);
  };

  if (!statusChecked) return <div className="fixed inset-0 bg-white flex items-center justify-center"><Loader2 className="animate-spin text-[#00A2FF]" /></div>

  return (
    <div className="flex-1 pb-24 bg-white min-h-screen relative select-none animate-in fade-in duration-300">
      <div className="bg-[#00A2FF] pt-6 pb-2 relative shadow-lg">
        <div className="px-4 grid grid-cols-2 gap-3 mb-4">
          <button onClick={() => router.push('/mystery-note')} className="h-28 bg-purple-600 border border-white/20 rounded-[1.5rem] p-4 flex flex-col items-start justify-center gap-1 active:scale-95 transition-all text-white shadow-lg">
            <FileText className="w-5 h-5 mb-1" /><p className="text-sm font-black">Mystery Note</p>
          </button>
          <button onClick={() => router.push('/tasks')} className="h-28 bg-blue-900 border border-white/20 rounded-[1.5rem] p-4 flex flex-col items-start justify-center gap-1 active:scale-95 transition-all text-white shadow-lg">
            <Target className="w-5 h-5 mb-1" /><p className="text-sm font-black">Task Center</p>
          </button>
        </div>

        <div className="sticky top-0 z-50 bg-[#00A2FF] px-6 py-4 flex items-center justify-between border-t border-white/10">
          <div className="flex items-center gap-8">
            {(['Recommend', 'Nearby'] as const).map((tab) => (
              <button key={tab} onClick={() => { setActiveTab(tab); setPage(0); setUsers([]); }} className={cn("text-sm font-black transition-all relative pb-2", activeTab === tab ? "text-white" : "text-white/40")}>
                {tab}
                {activeTab === tab && <div className="absolute -bottom-1 left-0 right-0 h-1 bg-white rounded-full animate-in zoom-in" />}
              </button>
            ))}
          </div>
          <button onClick={handleManualRefresh} disabled={isRefreshing} className={cn("p-2 text-white active:scale-90 transition-transform", isRefreshing && "animate-spin")}>
            <RotateCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <main className="px-4 pt-4 space-y-4 bg-white min-h-[60vh]">
        {initialLoading ? (
          <div className="grid grid-cols-2 gap-2.5">{[...Array(4)].map((_, i) => <div key={i} className="aspect-[1/1.25] rounded-[1.2rem] bg-gray-100 animate-pulse" />)}</div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 pb-10">
            {users.map((u) => (
              <Card key={u.uid} className="relative overflow-hidden border-none aspect-[1/1.25] rounded-[1.2rem] shadow-sm bg-gray-50 active:scale-95 transition-all cursor-pointer" onClick={() => router.push(`/users/${u.uid}`)}>
                <Image src={`${u.photo_url}?t=${u.updated_at}`} alt={u.name} fill className="object-cover" sizes="50vw" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-3 text-white">
                  <div className="flex items-center gap-1 mb-1.5">
                    <h4 className="font-black text-sm truncate tracking-tight">{u.name}</h4>
                    {u.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-[#00A2FF] fill-white" />}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="bg-[#00B200] text-white font-black text-[8px] px-2 py-0.5 rounded-md">{calculateAge(u.dob)}</span>
                    <span className="bg-black/30 backdrop-blur-md text-white text-[8px] font-bold px-2 py-0.5 rounded-md truncate border border-white/5">{u.country}</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
        {isLoadingMore && <div className="py-4 flex justify-center"><Loader2 className="animate-spin text-[#00A2FF]" /></div>}
      </main>
    </div>
  )
}
