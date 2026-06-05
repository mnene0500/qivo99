
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
  uid: string; 
  name: string; 
  photo_url: string; 
  country: string; 
  dob: string; 
  is_verified?: boolean; 
  updated_at: string;
}

const PAGE_SIZE = 12;

export default function HomePage() {
  const router = useRouter()
  const { user: currentUser, isInitialized } = useUser()
  const [activeTab, setActiveTab] = useState<'recommend' | 'nearby'>('recommend')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [users, setUsers] = useState<UserProfile[]>([])
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [profile, setProfile] = useState<any>(null)
  
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchUsers = useCallback(async (pageNum = 0) => {
    if (!currentUser?.id) return;
    if (pageNum === 0) setLoading(true);
    else setLoadingMore(true);

    // 1. Efficient single-row fetch for self
    const { data: myProfile } = await supabase
      .from('users')
      .select('uid, gender, country, blocking, blocked_by')
      .eq('uid', currentUser.id)
      .single();

    if (!myProfile) return;
    setProfile(myProfile);

    const oppositeGender = myProfile.gender === 'male' ? 'female' : 'male';
    const from = pageNum * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const blockedList = [...(myProfile.blocking || []), ...(myProfile.blocked_by || [])];

    // 2. Select ONLY necessary columns to save bandwidth
    let query = supabase.from('users')
      .select('uid, name, photo_url, country, dob, is_verified, updated_at')
      .eq('onboarding_complete', true)
      .eq('gender', oppositeGender)
      .is('is_deleted', false)
      .neq('uid', currentUser.id);

    if (blockedList.length > 0) {
       query = query.not('uid', 'in', `(${blockedList.join(',')})`);
    }

    if (activeTab === 'nearby') query = query.eq('country', myProfile.country);
    
    // 3. Apply Range Pagination
    const { data } = await query
      .order('updated_at', { ascending: false })
      .range(from, to);

    if (data) {
      if (pageNum === 0) {
        setUsers(data as any);
      } else {
        setUsers(prev => [...prev, ...(data as any)]);
      }
      setHasMore(data.length === PAGE_SIZE);
    }
    setLoading(false);
    setLoadingMore(false);
  }, [currentUser?.id, activeTab]);

  useEffect(() => {
    if (isInitialized) fetchUsers(0);
  }, [isInitialized, activeTab, fetchUsers]);

  // SCROLL RESTORATION & INFINITE LOAD
  useEffect(() => {
    const savedScroll = sessionStorage.getItem('home_scroll_pos');
    if (savedScroll && !loading) {
      setTimeout(() => {
        window.scrollTo(0, parseInt(savedScroll));
      }, 100);
    }

    const handleScroll = () => {
      sessionStorage.setItem('home_scroll_pos', window.scrollY.toString());
      
      const threshold = 500;
      const isAtBottom = (window.innerHeight + window.scrollY) >= document.body.offsetHeight - threshold;
      
      if (isAtBottom && !loadingMore && hasMore && !loading) {
        setPage(p => {
          const next = p + 1;
          fetchUsers(next);
          return next;
        });
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [loading, loadingMore, hasMore, fetchUsers]);

  const calculateAge = (dob: string) => {
    if (!dob) return 21;
    const diff = Date.now() - new Date(dob).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
  };

  return (
    <div className="flex flex-col w-full bg-white select-none min-h-screen">
      <div className="bg-[#00A2FF] pt-2 pb-3 shadow-xl rounded-b-[2.5rem] sticky top-0 z-50">
        <div className="px-4 grid grid-cols-2 gap-3 py-4">
          <button onClick={() => router.push('/mystery-note')} className="h-28 bg-gradient-to-br from-orange-400 to-orange-600 rounded-[2rem] p-5 flex flex-col items-start justify-center text-white shadow-lg active:scale-95 transition-all relative overflow-hidden group">
            <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
            <FileText className="w-5 h-5 mb-2 relative z-10" />
            <p className="text-[12px] font-black uppercase tracking-widest leading-tight relative z-10">Message<br/>Blast</p>
          </button>
          <button onClick={() => router.push('/tasks')} className="h-28 bg-white/10 backdrop-blur-md rounded-[2rem] p-5 flex flex-col items-start justify-center text-white border border-white/20 active:scale-95 transition-all relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent pointer-events-none" />
            <Target className="w-5 h-5 mb-2 relative z-10" />
            <p className="text-[12px] font-black uppercase tracking-widest leading-tight relative z-10">Task<br/>Center</p>
          </button>
        </div>

        <div className="px-5 py-1 flex items-center justify-between h-8">
          <div className="flex items-center gap-6">
            {['recommend', 'nearby'].map((t) => (
              <button key={t} onClick={() => { setPage(0); setActiveTab(t as any); }} className={cn("text-[9px] font-black uppercase tracking-widest transition-all", activeTab === t ? "text-white scale-110" : "text-white/40")}>
                {t}
              </button>
            ))}
          </div>
          <button onClick={() => fetchUsers(0)} className="p-2 text-white/60 active:rotate-180 transition-transform duration-500">
            <RotateCw className="w-3 h-3" />
          </button>
        </div>
      </div>

      <main className="px-4 pt-6 pb-24">
        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {[1,2,3,4,5,6].map(i => <div key={i} className="aspect-[1/1.3] bg-gray-50 rounded-[2rem] animate-pulse" />)}
          </div>
        ) : users.length === 0 ? (
          <div className="py-40 text-center opacity-40 uppercase font-black text-xs">No profiles found</div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {users.map((u) => {
              const isOnline = new Date(u.updated_at).getTime() > Date.now() - 5 * 60 * 1000;
              return (
                <Card key={u.uid} className="relative overflow-hidden border-none aspect-[1/1.3] rounded-[2rem] shadow-xl active:scale-[0.98] transition-all" onClick={() => router.push(`/users/${u.uid}`)}>
                  <Image src={u.photo_url} alt={u.name} fill className="object-cover" sizes="50vw" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                  
                  {/* CHAT BUTTON TOP RIGHT */}
                  <button 
                    onClick={(e) => { e.stopPropagation(); router.push(`/chats?startWith=${u.uid}`); }}
                    className="absolute top-4 right-4 bg-[#00A2FF] text-white text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full shadow-lg border border-white/20 active:scale-90 transition-transform z-20"
                  >
                    CHAT
                  </button>

                  {isOnline && (
                    <div className="absolute top-4 left-4 flex items-center gap-1.5 bg-black/20 backdrop-blur-md px-2 py-1 rounded-full border border-white/10">
                       <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                       <span className="text-[7px] font-black text-white uppercase tracking-widest">Active</span>
                    </div>
                  )}
                  <div className="absolute bottom-4 left-4 right-4 text-white">
                    <div className="flex items-center gap-1 mb-1">
                      <h4 className="font-black text-sm truncate">{u.name}</h4>
                      {u.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-[#00A2FF] fill-white" />}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="bg-[#006400] text-[9px] font-black px-1.5 py-0.5 rounded-md">{calculateAge(u.dob)}</span>
                      <span className="text-[9px] font-bold opacity-60 uppercase truncate">{u.country}</span>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
        {loadingMore && (
          <div className="py-10 flex justify-center w-full">
            <Loader2 className="w-6 h-6 animate-spin text-[#00A2FF]" />
          </div>
        )}
      </main>
    </div>
  )
}
