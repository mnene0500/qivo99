
"use client"

import { useEffect, useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { ChevronLeft, MessageSquare, CheckCircle2, ShieldCheck, Loader2, Package } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

interface UserProfile {
  uid: string
  name: string
  photo_url: string
  is_coin_seller?: boolean
  onboarding_complete?: boolean
}

function CoinSellersContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [sellers, setSellers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)

  const selectedPkg = searchParams.get("selectedPackage")
  const amount = searchParams.get("amount")

  useEffect(() => {
    supabase.from('users')
      .select('*')
      .eq('is_coin_seller', true)
      .eq('onboarding_complete', true)
      .limit(50)
      .then(({ data }) => {
        setSellers(data || [])
        setLoading(false)
      })
  }, [])

  const handleContactMerchant = (sellerUid: string) => {
    let msg = "Hello,_I_want_to_buy_coins"
    if (selectedPkg && amount) {
      msg = `Hello,_I_want_to_buy_the_${selectedPkg}_package_(${amount}_coins)`
    }
    router.push(`/chats?startWith=${sellerUid}&autoMsg=${msg}`)
  }

  return (
    <div className="flex-1 bg-white min-h-screen flex flex-col select-none">
      <header className="px-4 h-16 flex items-center justify-between border-b bg-white sticky top-0 z-50">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full"><ChevronLeft className="w-6 h-6 text-black" /></Button>
        <h1 className="text-sm font-bold text-black uppercase tracking-widest">Coinsellers</h1>
        <div className="w-10" />
      </header>

      <main className="flex-1 p-6">
        <div className="mb-8 space-y-3">
          <div className="flex items-center gap-2 text-[#00A2FF]"><ShieldCheck className="w-5 h-5" /><h2 className="text-lg font-bold">Verified Partners</h2></div>
          <p className="text-[11px] font-medium text-gray-500 leading-relaxed">Choose a certified coinseller to complete your purchase via local transfer. They will credit your account instantly.</p>
          
          {selectedPkg && (
            <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-2xl border border-blue-100 animate-in zoom-in-95">
              <div className="bg-white p-2 rounded-xl shadow-sm"><Package className="w-5 h-5 text-[#00A2FF]" /></div>
              <div>
                <p className="text-[8px] font-black uppercase text-blue-400 tracking-widest">Buying Request</p>
                <p className="text-xs font-black text-blue-900">{selectedPkg} Coins Package</p>
              </div>
            </div>
          )}
        </div>

        {loading ? <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-[#00A2FF]" /></div> : sellers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 px-12 text-center opacity-40">
            <ShieldCheck className="w-16 h-16 mb-4 text-gray-300" /><p className="font-bold text-sm uppercase tracking-widest text-gray-400">No active coinsellers</p>
          </div>
        ) : (
          <div className="space-y-4">
            {sellers.map((seller) => (
              <div key={seller.uid} className="flex items-center justify-between p-5 bg-gray-50 rounded-2xl border border-black/5">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <Avatar className="w-14 h-14 border-2 border-white shadow-sm">
                      <AvatarImage src={`${seller.photo_url}?t=${Date.now()}`} className="object-cover" />
                      <AvatarFallback>{seller.name?.[0]}</AvatarFallback>
                    </Avatar>
                    <div className="absolute -bottom-1 -right-1 bg-white p-0.5 rounded-full shadow-sm">
                      <CheckCircle2 className="w-4 h-4 text-blue-500 fill-current" />
                    </div>
                  </div>
                  <div>
                    <p className="font-bold text-sm text-black">{seller.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Active Now</p>
                    </div>
                  </div>
                </div>
                <Button 
                  onClick={() => handleContactMerchant(seller.uid)} 
                  className="rounded-xl bg-[#00A2FF] h-11 w-11 shadow-lg flex items-center justify-center hover:bg-[#0081CC] active:scale-95 transition-all"
                >
                  <MessageSquare className="w-5 h-5 text-white fill-current" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

export default function CoinSellersPage() {
  return (
    <Suspense fallback={null}>
      <CoinSellersContent />
    </Suspense>
  )
}
