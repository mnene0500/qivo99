"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ChevronLeft, Users, Loader2, UserPlus, UserMinus, Search, ShieldCheck, Briefcase, Coins, Crown } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { toggleUserRoleAction } from "@/app/actions/matchflow-actions"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/firebase/auth/use-user"

interface TargetUser {
  uid: string
  name: string
  match_flow_id: string
  gender: string
  is_coin_seller: boolean
  is_agent: boolean
  is_owner: boolean
}

export default function ManageRolesPage() {
  const router = useRouter()
  const { user } = useUser()
  const { toast } = useToast()
  const [targetId, setTargetId] = useState("")
  const [targetUser, setTargetUser] = useState<TargetUser | null>(null)
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)

  const handleSearch = async () => {
    if (!targetId.trim()) return
    setSearching(true)
    try {
      const { data, error } = await supabase
        .from("users")
        .select('uid, name, match_flow_id, gender, is_coin_seller, is_agent, is_owner')
        .eq("match_flow_id", targetId.trim())
        .maybeSingle()
      
      if (data) {
        setTargetUser(data as any)
      } else {
        setTargetUser(null)
        toast({ variant: "destructive", title: "User not found" })
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Search Error", description: err.message })
    } finally {
      setSearching(false)
    }
  }

  const handleRoleUpdate = async (role: 'is_coin_seller' | 'is_agent' | 'is_owner', value: boolean) => {
    if (!user || !targetUser) return
    
    // Enforcement: Only females can be agents per policy
    if (role === 'is_agent' && value === true && targetUser.gender !== 'female') {
      toast({ variant: "destructive", title: "Policy Restriction", description: "Only female users can be appointed as agents." })
      return
    }

    setLoading(true)
    try {
      const result = await toggleUserRoleAction(user.id, targetUser.match_flow_id, role, value)
      if (result.success) {
        toast({ title: "Authority Updated", description: result.message })
        setTargetUser(prev => prev ? { ...prev, [role]: value } : null)
      } else {
        toast({ variant: "destructive", title: "Update Failed", description: result.error })
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex-1 bg-white min-h-screen flex flex-col select-none">
      <header className="px-4 h-16 flex items-center justify-between border-b bg-white sticky top-0 z-50">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full"><ChevronLeft className="w-6 h-6 text-black" /></Button>
        <h1 className="text-sm font-black text-black uppercase tracking-widest">Authority Manager</h1>
        <div className="w-10" />
      </header>

      <main className="flex-1 p-8 flex flex-col items-center space-y-10">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 bg-indigo-50 rounded-[2.5rem] flex items-center justify-center mx-auto">
            <ShieldCheck className="w-10 h-10 text-indigo-600" />
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl font-black text-black tracking-tight uppercase">Owner Console</h2>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Appoint Owners, Merchants & Agents</p>
          </div>
        </div>

        <div className="w-full max-w-sm space-y-6">
          <div className="flex gap-2">
            <Input 
              placeholder="QIVO Numeric ID" 
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
              <div className="p-5 bg-gray-50 border rounded-3xl text-center space-y-1">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <span className="text-xs font-black text-black">{targetUser.name}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${targetUser.gender === 'female' ? 'bg-pink-100 text-pink-600' : 'bg-blue-100 text-blue-600'}`}>
                    {targetUser.gender}
                  </span>
                </div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">ID: {targetUser.match_flow_id}</p>
              </div>
              
              <div className="space-y-4">
                {/* OWNER ROLE */}
                <div className="p-4 bg-white rounded-2xl border flex items-center justify-between">
                   <div className="flex items-center gap-3">
                     <Crown className="w-5 h-5 text-indigo-600" />
                     <span className="text-[10px] font-black uppercase text-gray-500">System Owner</span>
                   </div>
                   <Button 
                    onClick={() => handleRoleUpdate('is_owner', !targetUser.is_owner)} 
                    disabled={loading}
                    variant={targetUser.is_owner ? "destructive" : "outline"}
                    className="h-9 px-6 rounded-full text-[9px] font-black uppercase tracking-widest"
                   >
                     {targetUser.is_owner ? "Revoke" : "Appoint"}
                   </Button>
                </div>

                {/* MERCHANT ROLE */}
                <div className="p-4 bg-white rounded-2xl border flex items-center justify-between">
                   <div className="flex items-center gap-3">
                     <Coins className="w-5 h-5 text-yellow-500" />
                     <span className="text-[10px] font-black uppercase text-gray-500">Certified Merchant</span>
                   </div>
                   <Button 
                    onClick={() => handleRoleUpdate('is_coin_seller', !targetUser.is_coin_seller)} 
                    disabled={loading}
                    variant={targetUser.is_coin_seller ? "destructive" : "outline"}
                    className="h-9 px-6 rounded-full text-[9px] font-black uppercase tracking-widest"
                   >
                     {targetUser.is_coin_seller ? "Revoke" : "Appoint"}
                   </Button>
                </div>

                {/* AGENT ROLE - Policy: Female Only */}
                <div className={`p-4 rounded-2xl border flex items-center justify-between ${targetUser.gender !== 'female' ? 'bg-gray-50 opacity-60' : 'bg-white'}`}>
                   <div className="flex items-center gap-3">
                     <Briefcase className="w-5 h-5 text-purple-600" />
                     <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase text-gray-500">Agency Leader</span>
                        {targetUser.gender !== 'female' && <span className="text-[7px] font-bold text-red-400 uppercase tracking-tighter">Female Users Only</span>}
                     </div>
                   </div>
                   <Button 
                    onClick={() => handleRoleUpdate('is_agent', !targetUser.is_agent)} 
                    disabled={loading || targetUser.gender !== 'female'}
                    variant={targetUser.is_agent ? "destructive" : "outline"}
                    className="h-9 px-6 rounded-full text-[9px] font-black uppercase tracking-widest"
                   >
                     {targetUser.is_agent ? "Revoke" : "Appoint"}
                   </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
