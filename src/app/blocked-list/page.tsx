"use client"

import { useMemo } from "react"
import { doc, updateDoc, arrayRemove } from "firebase/firestore"
import { useFirestore, useUser, useDoc, useMemoFirebase } from "@/firebase"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ChevronLeft, Ban, ShieldCheck, Loader2 } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useToast } from "@/hooks/use-toast"

interface UserProfile {
  uid: string
  name: string
  photoURL: string
  blocking?: string[]
}

function BlockedUserItem({ userId, onUnblock }: { userId: string, onUnblock: (id: string) => void }) {
  const db = useFirestore()
  const userRef = useMemo(() => doc(db, "users", userId), [db, userId])
  const { data: profile, loading } = useDoc<UserProfile>(userRef)

  if (loading) return (
    <div className="flex items-center gap-4 px-6 py-4 animate-pulse">
      <div className="w-12 h-12 rounded-full bg-gray-100" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-24 bg-gray-100 rounded" />
      </div>
    </div>
  )

  if (!profile) return null

  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50 bg-white">
      <div className="flex items-center gap-4">
        <Avatar className="w-12 h-12 border border-gray-100">
          <AvatarImage src={profile.photoURL} className="object-cover" />
          <AvatarFallback className="font-black text-xs">{profile.name?.[0]}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col">
          <span className="font-black text-sm text-black">{profile.name}</span>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Blocked</span>
        </div>
      </div>
      <Button 
        variant="outline" 
        size="sm" 
        onClick={() => onUnblock(userId)}
        className="rounded-full h-8 px-4 text-[10px] font-black uppercase tracking-widest border-[#00A2FF] text-[#00A2FF] hover:bg-blue-50"
      >
        Unblock
      </Button>
    </div>
  )
}

export default function BlockedListPage() {
  const router = useRouter()
  const { user } = useUser()
  const db = useFirestore()
  const { toast } = useToast()

  const profileRef = useMemoFirebase(() => user?.uid ? doc(db, "users", user.uid) : null, [db, user?.uid])
  const { data: profile, loading: profileLoading } = useDoc<UserProfile>(profileRef)

  const handleUnblock = async (targetId: string) => {
    if (!user || !profile) return
    try {
      const myRef = doc(db, "users", user.uid)
      const targetRef = doc(db, "users", targetId)

      // 1. Remove from my blocking list
      await updateDoc(myRef, {
        blocking: arrayRemove(targetId)
      })

      // 2. Remove from their blockedBy list
      await updateDoc(targetRef, {
        blockedBy: arrayRemove(user.uid)
      })

      toast({
        title: "User Unblocked",
        description: "This user can now interact with you again.",
      })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to unblock user.",
      })
    }
  }

  const blockedUids = profile?.blocking || []

  return (
    <div className="flex-1 bg-white min-h-screen flex flex-col select-none">
      <header className="flex items-center justify-between px-4 h-16 bg-white sticky top-0 z-50 border-b">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full">
          <ChevronLeft className="w-6 h-6 text-black" />
        </Button>
        <h1 className="text-base font-black text-black">Blocked List</h1>
        <div className="w-10" />
      </header>

      <main className="flex-1">
        {profileLoading ? (
          <div className="flex flex-col items-center justify-center py-20 opacity-20">
            <Loader2 className="w-8 h-8 animate-spin text-[#00A2FF]" />
          </div>
        ) : blockedUids.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 px-12 text-center space-y-6">
            <div className="w-20 h-20 bg-blue-50 rounded-[2rem] flex items-center justify-center">
              <ShieldCheck className="w-10 h-10 text-[#00A2FF]" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-black text-black tracking-tight">Your List is Empty</h2>
              <p className="text-sm font-medium text-gray-400">You haven't blocked anyone yet. Enjoy a safe community!</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col">
            <div className="bg-gray-50 px-6 py-3">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                {blockedUids.length} Blocked Users
              </p>
            </div>
            {blockedUids.map((uid) => (
              <BlockedUserItem key={uid} userId={uid} onUnblock={handleUnblock} />
            ))}
          </div>
        )}
      </main>

      <footer className="p-8 text-center bg-gray-50/30">
        <p className="text-[10px] font-bold text-gray-300 leading-relaxed max-w-xs mx-auto italic uppercase tracking-wider">
          Blocking a user prevents them from finding your profile and sending you messages.
        </p>
      </footer>
    </div>
  )
}