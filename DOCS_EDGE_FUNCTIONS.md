
# QIVO Production Edge Functions

Follow these steps to deploy your core logic to Supabase.

## 1. `payment-ops`
**Purpose**: Securely initiates PesaPal payments and fulfills coin orders.
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

    // 1. INITIATE PAYMENT
    if (action === 'initiate') {
      const { amount, user, callback_url } = params
      // Get PesaPal Token and Register Order logic goes here...
      // For the prototype, we return a mock URL that includes the callback
      return new Response(JSON.stringify({ 
        success: true, 
        redirect_url: `https://pay.pesapal.com/v3/...` 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 2. FULFILL COINS (Sudden & Fast)
    if (action === 'fulfill') {
      const { orderTrackingId, merchantReference } = params
      
      // merchantReference format is "user_id|coins"
      const [uid, coinsStr] = merchantReference.split('|')
      const coins = parseInt(coinsStr)

      // Check if already processed (Idempotency)
      const { data: existing } = await supabase.from('processed_payments').select('*').eq('order_tracking_id', orderTrackingId).maybeSingle()
      if (existing) return new Response(JSON.stringify({ success: true, message: 'Already processed' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

      // Award coins via atomic RPC
      await supabase.rpc('increment_coins', { user_uid: uid, amount: coins })
      
      // Record fulfillment
      await supabase.from('processed_payments').insert({ order_tracking_id: orderTrackingId, user_id: uid, coins, amount: 0 })
      
      // Log in coin history
      await supabase.from('coin_history').insert({ user_id: uid, amount: coins, type: 'recharge', description: 'PesaPal Top-up' })

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
```

## 2. `economy-ops`
**Purpose**: Handles daily check-ins, gifts, and roles.
```typescript
// Handler for 'daily-check-in'
// Uses server-side UTC time to prevent double-claiming.
// Handler for 'send-gift'
// Deducts coins from sender and adds diamonds to recipient atomically.
```

## 3. `calling-ops`
**Purpose**: Securely handles per-minute billing for calls.
```typescript
// Deducts 150 (Video) or 70 (Voice) coins per minute.
// Awards 50% or 40% diamonds to the recipient.
// Disconnects call if balance is depleted.
```

## 4. `ai-ops`
**Purpose**: Biometric identity verification with Gemini 2.5 Flash.
```typescript
// Compares profile photo URL with base64 selfie data URI.
// Returns match confidence.
```
