"use client"

import { useMemo, useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { RotateCw, BadgeCheck, Loader2, FileText, Target, User } from "lucide-react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { useUser } from "@/firebase/auth/use-user"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

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
  blocking?: string[]
  blocked_by?: string[]
}

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

  // 1. Auth and Global Profile Sync
  useEffect(() => {
    if (!isInitialized || authLoading) return;
    if (!currentUser) { router.replace("/welcome"); return; }

    const setupProfile = async () => {
      const { data } = await supabase.from('users').select('*').eq('uid', currentUser.id).maybeSingle();
      if (!data || !data.onboarding_complete) { router.replace("/fastonboard"); return; }
      setProfile(data as any);
      setStatusChecked(true);

      // REALTIME: Listen for profile changes (verified status, roles)
      const channel = supabase.channel(`home-profile-sync:${currentUser.id}`)
        .on('postgres_changes', { event: 'UPDATE', table: 'users', filter: `uid=eq.${currentUser.id}` }, (payload) => {
          setProfile(payload.new as any)
        })
        .subscribe()
      return () => { supabase.removeChannel(channel) }
    };

    setupProfile();
  }, [isInitialized, currentUser, authLoading, router])

  const fetchUsers = useCallback(async (isManual = false) => {
    if (!profile?.gender) return;
    if (isManual) setIsRefreshing(true);
    else setInitialLoading(true);

    try {
      const oppositeGender = profile.gender === 'male' ? 'female' : 'male';
      const { data } = await supabase.from('users').select('*').eq('onboarding_complete', true).eq('gender', oppositeGender).or('is_deleted.is.null,is_deleted.eq.false').limit(60);

      if (data) {
        const blockedUids = new Set([...(profile.blocking || []), ...(profile.blocked_by || [])]);
        const filtered = (data as UserProfile[]).filter(u => u.uid !== currentUser?.id && !blockedUids.has(u.uid))
        setUsers(filtered.sort(() => Math.random() - 0.5))
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsRefreshing(false)
      setInitialLoading(false)
    }
  }, [currentUser?.id, profile])

  useEffect(() => {
    if (statusChecked && profile && users.length === 0) fetchUsers();
  }, [statusChecked, profile, users.length, fetchUsers])

  const filteredUsers = useMemo(() => {
    if (activeTab === 'Nearby' && profile) return users.filter(u => u.country === profile.country)
    return users
  }, [users, activeTab, profile])

  if (!statusChecked) return <div className="fixed inset-0 bg-white" />

  return (
    <div className="flex-1 pb-24 bg-white min-h-screen relative select-none animate-in fade-in duration-300">
      <header className="bg-[#00A2FF] h-4 relative overflow-hidden flex items-center px-6 justify-between" />

      <div className="relative px-4 grid grid-cols-2 gap-3 -mt-4 z-20 mb-4">
        <button 
          onClick={() => router.push('/mystery-note')} 
          className="h-28 bg-gradient-to-br from-[#00A2FF] to-[#0081CC] rounded-[1.5rem] p-4 flex flex-col items-start justify-end gap-1 shadow-xl active:scale-95 transition-all text-white text-left"
        >
          <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center mb-1">
            <FileText className="w-4 h-4 text-white" />
          </div>
          <p className="text-base font-black leading-none">Mystery Note</p>
          <p className="text-[8px] font-bold opacity-80 tracking-widest uppercase">SEND A NOTE</p>
        </button>
        <button onClick={() => router.push('/tasks')} className="h-28 bg-gradient-to-br from-[#7C69FF] to-[#A28EFF] rounded-[1.5rem] p-4 flex flex-col items-start justify-end gap-1 shadow-xl active:scale-95 transition-all text-white text-left"><div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center mb-1"><Target className="w-4 h-4 text-white" /></div><p className="text-base font-black leading-none">Task Center</p><p className="text-[8px] font-bold opacity-80 tracking-widest uppercase">EARN REWARDS</p></button>
      </div>

      <div className="sticky top-0 z-30 bg-white">
        <div className="px-6 py-2 flex items-center justify-between border-b border-black/5">
          <div className="flex items-center gap-6">
            <button onClick={() => setActiveTab('Recommend')} className={cn("text-sm font-black transition-all relative pb-2", activeTab === 'Recommend' ? "text-[#00A2FF]" : "text-gray-300")}>Recommend</button>
            <button onClick={() => setActiveTab('Nearby')} className={cn("text-sm font-black transition-all relative pb-2", activeTab === 'Nearby' ? "text-[#00A2FF]" : "text-gray-300")}>Nearby</button>
          </div>
          <button onClick={() => fetchUsers(true)} disabled={isRefreshing} className={cn("p-2 text-[#00A2FF] active:scale-90 transition-transform", isRefreshing && "animate-spin")}><RotateCw className="w-4 h-4" /></button>
        </div>
      </div>

      <main className="px-4 pt-3 space-y-4">
        {initialLoading && users.length === 0 ? (
          <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-[#00A2FF] w-8 h-8" /></div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 pb-10">
            {filteredUsers.map((u) => (
              <Card key={u.uid} className="relative overflow-hidden border-none aspect-[1/1.25] rounded-[1.2rem] shadow-sm bg-gray-50 group active:scale-95 transition-all cursor-pointer" onClick={() => router.push(`/users/${u.uid}`)}>
                <Image src={`${u.photo_url}?t=${Date.now()}`} alt={u.name} fill className="object-cover" sizes="(max-width: 768px) 50vw, 300px" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-90" />
                <div onClick={(e) => { e.stopPropagation(); router.push(`/chats?startWith=${u.uid}`); }} className="absolute top-2.5 right-2.5 px-3.5 h-7 bg-[#00A2FF] rounded-full flex items-center justify-center text-white shadow-lg active:scale-90 transition-all z-20"><span className="text-[8px] font-black uppercase tracking-widest">CHAT</span></div>
                <div className="absolute inset-x-0 bottom-0 p-3 text-white">
                  <div className="flex items-center gap-1 mb-1.5"><h4 className="font-black text-sm truncate tracking-tight">{u.name}</h4>{u.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-[#00A2FF] fill-white" />}</div>
                  <div className="flex items-center gap-1.5"><span className="bg-[#00B200] text-white font-black text-[8px] px-2 py-0.5 rounded-md">{calculateAge(u.dob)}</span><span className="bg-black/30 backdrop-blur-md text-white text-[8px] font-bold px-2 py-0.5 rounded-md truncate border border-white/5">{u.country}</span></div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
