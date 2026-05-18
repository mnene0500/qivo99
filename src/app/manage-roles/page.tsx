"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ChevronLeft, Users, Loader2, UserPlus, UserMinus, Search } from "lucide-react"
import { useUser, useFirestore } from "@/firebase"
import { useToast } from "@/hooks/use-toast"
import { toggleUserRoleAction } from "@/app/actions/matchflow-actions"
import { collection, query, where, getDocs } from "firebase/firestore"

interface TargetUser {
  uid: string
  name: string
  matchFlowId: string
  isCoinSeller: boolean
  isAgent: boolean
}

export default function ManageRolesPage() {
  const router = useRouter()
  const { user } = useUser()
  const db = useFirestore()
  const { toast } = useToast()
  const [targetId, setTargetId] = useState("")
  const [targetUser, setTargetUser] = useState<TargetUser | null>(null)
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)

  const handleSearch = async () => {
    if (!targetId.trim()) return
    setSearching(true)
    try {
      const q = query(collection(db, "users"), where("matchFlowId", "==", targetId.trim()))
      const snap = await getDocs(q)
      if (!snap.empty) {
        const d = snap.docs[0]
        setTargetUser({ uid: d.id, ...d.data() } as TargetUser)
      } else {
        setTargetUser(null)
        toast({ variant: "destructive", title: "User not found" })
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message })
    } finally {
      setSearching(false)
    }
  }

  const handleRoleUpdate = async (role: 'isCoinSeller' | 'isAgent', value: boolean) => {
    if (!user || !targetUser) return
    setLoading(true)
    try {
      const result = await toggleUserRoleAction(user.uid, targetUser.matchFlowId, role, value)
      if (result.success) {
        toast({ title: "Success", description: result.message })
        // Refresh local state
        setTargetUser(prev => prev ? { ...prev, [role]: value } : null)
      } else {
        toast({ variant: "destructive", title: "Error", description: result.error })
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex-1 bg-white min-h-screen flex flex-col">
      <header className="px-4 h-16 flex items-center justify-between border-b">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full"><ChevronLeft className="w-6 h-6 text-black" /></Button>
        <h1 className="text-base font-black text-black">User Roles</h1>
        <div className="w-10" />
      </header>

      <main className="flex-1 p-8 flex flex-col items-center space-y-10">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 bg-purple-50 rounded-[2.5rem] flex items-center justify-center mx-auto">
            <Users className="w-10 h-10 text-purple-600" />
          </div>
          <h2 className="text-2xl font-black text-black tracking-tight">Authority Management</h2>
        </div>

        <div className="w-full max-w-sm space-y-6">
          <div className="flex gap-2">
            <Input 
              placeholder="MatchFlow ID" 
              value={targetId} 
              onChange={(e) => setTargetId(e.target.value)} 
              className="rounded-2xl h-14 border-gray-100 bg-gray-50 font-bold"
            />
            <Button onClick={handleSearch} disabled={searching} className="h-14 w-14 rounded-2xl bg-black">
              {searching ? <Loader2 className="animate-spin text-white" /> : <Search className="w-5 h-5 text-white" />}
            </Button>
          </div>

          {targetUser && (
            <div className="space-y-8 animate-in fade-in duration-300">
              <div className="p-4 bg-gray-50 rounded-2xl text-center">
                <p className="text-sm font-bold">{targetUser.name}</p>
                <p className="text-[10px] text-gray-400">UID: {targetUser.uid}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <p className="text-[9px] font-black text-center text-gray-400 uppercase">Coin Seller</p>
                  {targetUser.isCoinSeller ? (
                    <Button onClick={() => handleRoleUpdate('isCoinSeller', false)} disabled={loading} className="w-full h-14 rounded-2xl bg-red-50 text-red-600 border border-red-100 font-bold text-[10px] uppercase gap-2">
                      <UserMinus className="w-4 h-4" /> Revoke
                    </Button>
                  ) : (
                    <Button onClick={() => handleRoleUpdate('isCoinSeller', true)} disabled={loading} className="w-full h-14 rounded-2xl bg-blue-600 text-white font-bold text-[10px] uppercase gap-2">
                      <UserPlus className="w-4 h-4" /> Appoint
                    </Button>
                  )}
                </div>

                <div className="space-y-3">
                  <p className="text-[9px] font-black text-center text-gray-400 uppercase">Agency Agent</p>
                  {targetUser.isAgent ? (
                    <Button onClick={() => handleRoleUpdate('isAgent', false)} disabled={loading} className="w-full h-14 rounded-2xl bg-red-50 text-red-600 border border-red-100 font-bold text-[10px] uppercase gap-2">
                      <UserMinus className="w-4 h-4" /> Revoke
                    </Button>
                  ) : (
                    <Button onClick={() => handleRoleUpdate('isAgent', true)} disabled={loading} className="w-full h-14 rounded-2xl bg-purple-600 text-white font-bold text-[10px] uppercase gap-2">
                      <UserPlus className="w-4 h-4" /> Appoint
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )