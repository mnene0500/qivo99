
"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { RotateCw, BadgeCheck, FileText, Target, Loader2, Sparkles, MessageSquare, MapPin } from "lucide-react"
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
let globalUserCache: UserProfile[] = []; // Simple cross-mount cache

function calculateAge(dob: string) {
  if (!dob) return 18
  const birthDate = new Date(dob); const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
}

export default function HomePage() {
  const router = useRouter()
  const { user: currentUser, loading: authLoading, isInitialized } = useUser()
  
  const [activeTab, setActiveTab] = useState<'recommend' | 'nearby'>('recommend')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [users, setUsers] = useState<UserProfile[]>(globalUserCache)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [profile, setProfile] = useState<any>(null)

  const fetchUsers = useCallback(async (pageNum = 0, reshuffle = false) => {
    if (!profile) return;
    if (pageNum === 0) setIsRefreshing(true);

    try {
      const from = pageNum * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const oppositeGender = profile.gender === 'male' ? 'female' : 'male';
      const blockedList = [...(profile.blocking || []), ...(profile.blocked_by || [])];

      let query = supabase
        .from('users')
        .select('*')
        .eq('onboarding_complete', true)
        .eq('gender', oppositeGender)
        .is('is_deleted', false)
        .not('uid', 'in', `(${[currentUser!.id, ...blockedList].join(',')})`);

      if (activeTab === 'nearby') {
        query = query.eq('country', profile.country);
      }
      
      // ORDER BY updated_at to bring online/recent users to the top
      query = query.order('updated_at', { ascending: false }).range(from, to);

      const { data } = await query;

      if (data) {
        let finalData = pageNum === 0 ? data : [...users, ...data];
        
        if (reshuffle && finalData.length > 3) {
          // RESHUFFLE LOGIC:
          // Keep the very top users (active now) but shuffle the order slightly
          // specifically "move first to middle, push others up" as requested
          const active = finalData.slice(0, 4);
          const others = finalData.slice(4);
          
          // Cyclic shift for active ones
          const shiftedActive = [active[1], active[2], active[0], active[3]];
          finalData = [...shiftedActive, ...others];
        }

        setUsers(finalData as any);
        globalUserCache = finalData as any;
        setHasMore(data.length === PAGE_SIZE);
        setPage(pageNum);
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [currentUser?.id, profile, activeTab, users]);

  useEffect(() => {
    if (isInitialized && currentUser && !profile) {
      supabase.from('users').select('*').eq('uid', currentUser.id).single().then(({ data }) => {
        if (data?.onboarding_complete) setProfile(data);
        else if (data) router.replace("/fastonboard");
      });
    }
  }, [isInitialized, currentUser, router, profile]);

  useEffect(() => {
    // Only fetch on tab change or if cache is empty
    if (profile && (users.length === 0 || activeTab)) {
      fetchUsers(0);
    }
  }, [profile, activeTab]);

  const handleRefresh = () => {
    fetchUsers(0, true);
  }

  return (
    <div className="flex flex-col w-full bg-white select-none">
      <div className="px-4 grid grid-cols-2 gap-3 py-6 bg-white shrink-0">
        <button onClick={() => router.push('/mystery-note')} className="h-28 bg-gradient-to-br from-blue-900 via-blue-800 to-blue-600 rounded-[2rem] p-6 flex flex-col items-start justify-center gap-1 text-white shadow-xl shadow-blue-100 relative overflow-hidden group">
          <FileText className="w-6 h-6 mb-1 drop-shadow-md" /><p className="text-sm font-black uppercase tracking-widest">Message</p><p className="text-[10px] font-bold opacity-60 uppercase tracking-tighter">Blast</p>
        </button>
        <button onClick={() => router.push('/tasks')} className="h-28 bg-gradient-to-br from-purple-900 via-purple-800 to-purple-600 rounded-[2rem] p-6 flex flex-col items-start justify-center gap-1 text-white shadow-xl shadow-purple-100 relative overflow-hidden group">
          <Target className="w-6 h-6 mb-1 drop-shadow-md" /><p className="text-sm font-black uppercase tracking-widest">Task</p><p className="text-[10px] font-bold opacity-60 uppercase tracking-tighter">Center</p>
        </button>
      </div>

      <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl px-5 py-3 flex items-center justify-between border-b border-gray-50 h-14">
        <div className="flex items-center gap-6">
          {[
            { id: 'recommend', label: 'Recommend' },
            { id: 'nearby', label: 'Nearby' }
          ].map((tab) => (
            <button 
              key={tab.id} 
              onClick={() => setActiveTab(tab.id as any)} 
              className={cn(
                "text-xs font-black uppercase tracking-widest transition-all", 
                activeTab === tab.id ? "text-[#00A2FF]" : "text-gray-300"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button onClick={handleRefresh} className={cn("p-2 text-gray-400 active:rotate-180 transition-transform", isRefreshing && "animate-spin")}><RotateCw className="w-4 h-4" /></button>
      </div>

      <main className="px-4 pt-4 pb-24">
        {users.length === 0 && !isRefreshing ? (
          <div className="py-40 text-center opacity-40 px-12">
            <p className="font-black text-xs uppercase tracking-widest">No profiles found</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {users.map((u) => (
              <Card key={u.uid} className="relative overflow-hidden border-none aspect-[1/1.3] rounded-[2rem] shadow-xl bg-gray-50" onClick={() => router.push(`/users/${u.uid}`)}>
                <Image src={u.photo_url} alt={u.name} fill className="object-cover" sizes="50vw" priority />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                <div className="absolute bottom-4 left-4 right-4 text-white">
                  <div className="flex items-center gap-1 mb-1">
                    <h4 className="font-black text-sm truncate max-w-[80px]">{u.name}</h4>
                    {u.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-[#00A2FF] fill-white" />}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-[#006400] text-[9px] font-black px-1.5 py-0.5 rounded-md">{calculateAge(u.dob)}</span>
                    <span className="text-[9px] font-bold opacity-60 uppercase truncate">{u.country}</span>
                  </div>
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); router.push(`/chats?startWith=${u.uid}`); }} 
                  className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-2xl hover:bg-[#00A2FF] transition-all"
                >
                  <MessageSquare className="w-4 h-4 fill-current" />
                </button>
              </Card>
            ))}
          </div>
        )}
        {hasMore && users.length > 0 && !isRefreshing && (
          <div className="py-10 flex justify-center">
             <Button onClick={() => fetchUsers(page + 1)} variant="ghost" className="text-[10px] font-black uppercase tracking-widest">Load More</Button>
          </div>
        )}
      </main>
    </div>
  )
}
