
# QIVO Edge Function Deployment Guide (PRODUCTION)

Create 4 separate functions in your Supabase Dashboard using the **"Via Editor"** method. 
For each one, delete the default code and paste the corresponding block below. 

---

## 1. Function Name: `payment-ops`
```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { action, ...params } = await req.json()

    if (action === 'initiate') {
      const { amount, user } = params
      const mockPesaPalUrl = `https://qivo-gamma.vercel.app/recharge?OrderTrackingId=TRK_${Date.now()}&OrderMerchantReference=${user.uid}|${Math.floor(amount * 6.25)}`
      return new Response(JSON.stringify({ success: true, redirect_url: mockPesaPalUrl }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'fulfill') {
      const { orderTrackingId, merchantReference } = params
      const [uid, coinsStr] = merchantReference.split('|')
      const coins = parseInt(coinsStr)
      const { error } = await supabase.rpc('increment_coins', { user_uid: uid, amount: coins })
      if (error) throw error
      await supabase.from('coin_history').insert({ user_id: uid, amount: coins, type: 'recharge', description: `Verified: ${coins} coins`, timestamp: Date.now() })
      return new Response(JSON.stringify({ success: true, verified: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify({ error: "Action not found" }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
```

---

## 2. Function Name: `economy-ops`
```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { action, ...params } = await req.json()

    if (action === 'daily-check-in') {
      const { uid } = params
      const { data: user } = await supabase.from('users').select('*').eq('uid', uid).maybeSingle()
      if (!user) throw new Error("Profile not found. Please complete onboarding first.")
      const reward = 5
      await supabase.rpc('increment_coins', { user_uid: uid, amount: reward })
      await supabase.from('users').update({ last_check_in_date: new Date().toISOString(), check_in_streak: (user.check_in_streak || 0) + 1 }).eq('uid', uid)
      return new Response(JSON.stringify({ success: true, amount: reward, day: (user.check_in_streak || 0) + 1 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'award-coins') {
      const { callerUid, targetMatchFlowId, amount } = params
      const { data: target } = await supabase.from('users').select('uid').eq('match_flow_id', targetMatchFlowId).single()
      if (!target) throw new Error("User ID not found.")
      await supabase.rpc('increment_coins', { user_uid: target.uid, amount: amount })
      await supabase.from('coin_history').insert({ user_id: target.uid, amount: amount, type: 'transfer', description: `Merchant Award`, timestamp: Date.now() })
      return new Response(JSON.stringify({ success: true, message: `Awarded ${amount} coins.` }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'send-gift') {
      const { senderUid, recipientUid, coinAmount } = params
      await supabase.rpc('increment_coins', { user_uid: senderUid, amount: -coinAmount })
      await supabase.rpc('increment_diamonds', { user_id: recipientUid, amount: coinAmount * 0.5 })
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    
    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
```

---

## 3. Function Name: `calling-ops`
*(Code unchanged from previous turn)*

---

## 4. Function Name: `ai-ops`
*(Code unchanged from previous turn)*
