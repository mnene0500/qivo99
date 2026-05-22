'use server';

import { supabaseAdmin } from '@/lib/supabase';

/**
 * @fileOverview Secure Call Actions.
 * Handles ZegoCloud configuration and per-minute billing.
 */

export async function getZegoConfigAction() {
  const appId = process.env.ZEGO_APP_ID;
  const serverSecret = process.env.ZEGO_SERVER_SECRET;

  if (!appId || !serverSecret) {
    console.error("ZegoCloud Error: Missing ZEGO_APP_ID or ZEGO_SERVER_SECRET in environment variables.");
    return { success: false, error: "Calling service not configured." };
  }

  return {
    success: true,
    appId: Number(appId),
    serverSecret: serverSecret
  };
}

/**
 * Deducts coins for calls using Admin client to bypass RLS restrictions on balances.
 * Also awards Diamonds to the recipient (50% for females, 40% for males).
 */
export async function deductCallCoinsAction(uid: string, type: 'video' | 'voice', partnerId: string, partnerName: string) {
  const cost = type === 'video' ? 150 : 70;

  try {
    // 1. Get Caller Balance
    const { data: callerBal } = await supabaseAdmin.from('balances').select('coins').eq('user_id', uid).maybeSingle();
    const currentCoins = Number(callerBal?.coins) || 0;

    if (currentCoins < cost) return { success: false, error: "Insufficient balance." };

    // 2. Get Recipient Profile for Diamond Reward
    const { data: recipient } = await supabaseAdmin.from('users').select('gender, name').eq('uid', partnerId).single();
    
    // Default rewards: 50% for females, 40% for males
    const rewardRate = recipient?.gender === 'female' ? 0.5 : 0.4;
    const diamondReward = Math.floor(cost * rewardRate);

    const timestamp = Date.now();

    // 3. Atomic Updates
    const { error: deductErr } = await supabaseAdmin.from('balances').update({ coins: currentCoins - cost }).eq('user_id', uid);
    if (deductErr) throw deductErr;

    // Award to Recipient
    await supabaseAdmin.rpc('increment_diamonds', { user_id: partnerId, amount: diamondReward });
    
    // Log History
    await Promise.all([
      supabaseAdmin.from('coin_history').insert({
        user_id: uid,
        amount: -cost,
        type: 'call',
        description: `${type.charAt(0).toUpperCase() + type.slice(1)} call with ${partnerName}`,
        timestamp
      }),
      supabaseAdmin.from('diamond_history').insert({
        user_id: partnerId,
        amount: diamondReward,
        type: 'call_reward',
        description: `Earned from ${type} call`,
        timestamp
      })
    ]);

    return { success: true };
  } catch (error: any) {
    console.error("Billing Error:", error.message);
    return { success: false, error: error.message };
  }
}

export async function checkCallBalanceAction(uid: string, type: 'video' | 'voice') {
  const minRequired = type === 'video' ? 150 : 70;
  try {
    const { data: caller } = await supabaseAdmin.from('users').select('is_admin, is_coin_seller').eq('uid', uid).single();
    
    // Admins and Coin Sellers call for free
    if (caller?.is_admin || caller?.is_coin_seller) return { success: true };

    const { data: bal } = await supabaseAdmin.from('balances').select('coins').eq('user_id', uid).maybeSingle();
    const coins = Number(bal?.coins) || 0;
    
    if (coins < minRequired) return { success: false, error: "Low balance." };
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
