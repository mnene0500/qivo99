
"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { RotateCw, BadgeCheck, FileText, Target, Loader2, Sparkles } from "lucide-react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { useUser } from "@/firebase/auth/use-user"
import { Button } from "@/components/ui/button"

interface UserProfile {
  uid: string
  name: string
  photo_url: string
  country: string
  gender: string
  dob: string
  is_verified?: boolean
  updated_at: string
}

const PAGE_SIZE = 12;

let cachedUsers: UserProfile[] = [];
let cachedTab: 'Recommend' | 'Nearby' = 'Recommend';
let cachedPage = 0;

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
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [users, setUsers] = useState<UserProfile[]>(cachedUsers)
  const [activeTab, setActiveTab] = useState<'Recommend' | 'Nearby'>(cachedTab)
  const [page, setPage] = useState(cachedPage)
  const [hasMore, setHasMore] = useState(true)
  const [profile, setProfile] = useState<any>(null)
  
  const observerTarget = useRef<HTMLDivElement>(null)
  const hasFetched = useRef(false)

  const fetchUsers = useCallback(async (pageNum = 0, isManual = false, targetTab?: 'Recommend' | 'Nearby') => {
    if (!profile) return;
    
    const currentTab = targetTab || activeTab;
    const shouldShowLoading = pageNum === 0 && users.length === 0;
    if (shouldShowLoading || isManual) setIsRefreshing(true);
    if (pageNum > 0) setIsLoadingMore(true);

    try {
      const from = pageNum * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const oppositeGender = profile.gender === 'male' ? 'female' : profile.gender === 'female' ? 'male' : null;
      const blockedList = [...(profile.blocking || []), ...(profile.blocked_by || [])];

      let query = supabase
        .from('users')
        .select('uid, name, photo_url, country, dob, is_verified, updated_at')
        .eq('onboarding_complete', true)
        .is('is_deleted', false)
        .not('uid', 'in', `(${[currentUser?.id, ...blockedList].join(',')})`)
        .order('updated_at', { ascending: false })
        .range(from, to);

      if (oppositeGender) {
        query = query.eq('gender', oppositeGender);
      }
      
      if (currentTab === 'Nearby' && profile.country) {
        query = query.eq('country', profile.country);
      }

      const { data, error } = await query;
      
      if (error) throw error;

      if (data) {
        const filtered = (data as any[]).filter(u => u.uid !== currentUser?.id);
        
        if (pageNum === 0) {
          setUsers(filtered);
          cachedUsers = filtered;
        } else {
          setUsers(prev => {
             const existingIds = new Set(prev.map(u => u.uid));
             const uniqueNew = filtered.filter(u => !existingIds.has(u.uid));
             return [...prev, ...uniqueNew];
          });
          cachedUsers = [...cachedUsers, ...filtered.filter(u => !new Set(cachedUsers.map(x => u.uid)).has(u.uid))];
        }
        
        setHasMore(data.length === PAGE_SIZE);
        setPage(pageNum);
        cachedPage = pageNum;
      }
    } catch (err) {
      console.error("Fetch Users Error:", err);
    } finally {
      setIsRefreshing(false);
      setIsLoadingMore(false);
    }
  }, [currentUser?.id, profile, activeTab, users.length]);

  useEffect(() => {
    if (isInitialized && currentUser && !profile) {
      supabase.from('users').select('*').eq('uid', currentUser.id).single()
        .then(({ data }) => {
          if (data?.onboarding_complete) {
            setProfile(data);
          } else if (!data && !authLoading) {
             router.replace("/fastonboard");
          }
        });
    }
  }, [isInitialized, currentUser, router, profile, authLoading]);

  useEffect(() => {
    if (profile && !hasFetched.current) {
      fetchUsers(0, false, activeTab);
      hasFetched.current = true;
    }
  }, [profile, fetchUsers, activeTab]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore && !isRefreshing && profile) {
          fetchUsers(page + 1);
        }
      },
      { threshold: 0.1 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, isRefreshing, page, fetchUsers, profile]);

  useEffect(() => {
    const handleRefresh = (e: any) => {
      if (e.detail.path === '/home') {
        fetchUsers(0, true);
      }
    }
    window.addEventListener('qivo-nav-refresh', handleRefresh);
    return () => window.removeEventListener('qivo-nav-refresh', handleRefresh);
  }, [fetchUsers])

  const handleTabChange = (tab: 'Recommend' | 'Nearby') => {
    if (activeTab === tab) return;
    setActiveTab(tab);
    cachedTab = tab;
    setPage(0);
    cachedPage = 0;
    cachedUsers = [];
    setUsers([]);
    fetchUsers(0, true, tab);
  }

  if (authLoading || !isInitialized) return null;

  return (
    <div className="flex flex-col w-full bg-white select-none">
      <div className="px-4 grid grid-cols-2 gap-3 py-6 bg-[#00A2FF] shrink-0">
        <button 
          onClick={() => router.push('/mystery-note')} 
          className="h-28 bg-gradient-to-br from-purple-500/80 to-purple-700/90 border border-white/20 rounded-2xl p-6 flex flex-col items-start justify-center gap-1 active:scale-95 transition-all text-white shadow-xl relative overflow-hidden group backdrop-blur-sm"
        >
          <div className="absolute -right-4 -top-4 w-20 h-20 bg-white/10 rounded-full blur-2xl group-active:scale-150 transition-transform" />
          <FileText className="w-6 h-6 mb-1 text-purple-100" />
          <div className="text-left">
            <p className="text-[13px] font-black tracking-tight leading-none mb-1">Message Blast</p>
            <p className="text-[9px] font-bold text-purple-100/70">Connect With Many</p>
          </div>
        </button>
        
        <button 
          onClick={() => router.push('/tasks')} 
          className="h-28 bg-gradient-to-br from-blue-600/80 to-indigo-800/90 border border-white/20 rounded-2xl p-6 flex flex-col items-start justify-center gap-1 active:scale-95 transition-all text-white shadow-xl relative overflow-hidden group backdrop-blur-sm"
        >
          <div className="absolute -right-4 -top-4 w-20 h-20 bg-white/10 rounded-full blur-2xl group-active:scale-150 transition-transform" />
          <Target className="w-6 h-6 mb-1 text-blue-100" />
          <div className="text-left">
            <p className="text-[13px] font-black tracking-tight leading-none mb-1">Task Center</p>
            <p className="text-[9px] font-bold text-blue-100/70">Daily Rewards</p>
          </div>
        </button>
      </div>

      <div className="sticky top-0 z-40 bg-[#00A2FF] px-4 py-2 flex items-center justify-between border-b border-white/10 shadow-md h-12">
        <div className="flex items-center gap-8">
          {(['Recommend', 'Nearby'] as const).map((tab) => (
            <button key={tab} onClick={() => handleTabChange(tab)} className={cn("text-[13px] font-black transition-all relative py-2", activeTab === tab ? "text-white" : "text-white/40")}>
              {tab}
              {activeTab === tab && <div className="absolute bottom-0 left-0 right-0 h-1 bg-white rounded-full animate-in fade-in" />}
            </button>
          ))}
        </div>
        <button onClick={() => fetchUsers(0, true)} className={cn("p-2 text-white active:scale-90 transition-transform", isRefreshing && "animate-spin")}>
          <RotateCw className="w-4 h-4" />
        </button>
      </div>

      <main className="px-4 pt-4">
        {users.length > 0 ? (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              {users.map((u) => (
                <Card key={u.uid} className="relative overflow-hidden border-none aspect-[1/1.25] rounded-lg shadow-lg bg-gray-50 active:scale-95 transition-all cursor-pointer" onClick={() => router.push(`/users/${u.uid}`)}>
                  <Image src={`${u.photo_url}?t=${u.updated_at}`} alt={u.name} fill className="object-cover" sizes="50vw" priority />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                  
                  <Button 
                    className="absolute top-2 right-2 rounded-full h-7 px-4 bg-[#00A2FF]/90 backdrop-blur-md text-white text-[10px] font-black uppercase tracking-widest shadow-xl z-20 active:scale-90 border border-white/20" 
                    onClick={(e) => { e.stopPropagation(); router.push(`/chats?startWith=${u.uid}`); }}
                  >
                    Chat
                  </Button>

                  <div className="absolute inset-x-0 bottom-0 p-3 text-white">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <h4 className="font-black text-[13px] truncate tracking-tight">{u.name}</h4>
                        {u.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-[#00A2FF] fill-white shrink-0" />}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="bg-[#00B200] text-white font-black text-[9px] px-1.5 py-0.5 rounded-md">{calculateAge(u.dob)}</span>
                        <span className="text-[9px] font-bold opacity-70 truncate uppercase tracking-tighter">{u.country}</span>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
            
            <div ref={observerTarget} className="h-20 flex items-center justify-center py-10">
              {hasMore && (
                <div className="flex items-center gap-2 text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin text-[#00A2FF]" />
                  <span className="text-[10px] font-bold tracking-widest uppercase">Searching...</span>
                </div>
              )}
            </div>
          </>
        ) : (
          !isRefreshing && (
            <div className="flex flex-col items-center justify-center py-40 opacity-20 text-center px-10">
              <Target className="w-12 h-12 mb-4 text-gray-400" />
              <p className="text-[11px] font-bold text-gray-500">
                {activeTab === 'Nearby' ? "No users found in your country" : "No users found"}
              </p>
            </div>
          )
        )}
      </main>
    </div>
  )
}
