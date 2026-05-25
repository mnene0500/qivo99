'use server';

import { getSupabaseAdmin } from '@/lib/supabase';
import { RtcTokenBuilder, RtcRole } from 'agora-token';

/**
 * @fileOverview Agora Token Generation and Calling Economy for Owner system.
 */

export async function generateAgoraTokenAction(channelName: string, uid: string) {
  const appId = process.env.AGORA_APP_ID;
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;

  if (!appId || !appCertificate) {
    throw new Error("Agora Credentials missing in Vercel Settings.");
  }

  const numericUid = Math.abs(uid.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a }, 0));
  const role = RtcRole.PUBLISHER;
  const expirationTimeInSeconds = 3600;
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

  const token = RtcTokenBuilder.buildTokenWithUid(
    appId,
    appCertificate,
    channelName,
    numericUid,
    role,
    privilegeExpiredTs,
    privilegeExpiredTs
  );

  return {
    appId,
    token,
    channelName,
    uid: numericUid
  };
}

export async function startCallAction(chatId: string, callerId: string, receiverId: string, type: 'video' | 'voice') {
  const supabase = getSupabaseAdmin();
  try {
    const cost = type === 'video' ? 150 : 70;
    const { data: user } = await supabase.from('users').select('is_owner, is_coin_seller').eq('uid', callerId).single();
    
    if (!user?.is_owner && !user?.is_coin_seller) {
      const { data: bal } = await supabase.from('balances').select('coins').eq('user_id', callerId).single();
      if ((Number(bal?.coins) || 0) < cost) {
        return { success: false, error: "Insufficient coins for call." };
      }
    }

    await supabase.from('calls').update({ status: 'ended' }).eq('chat_id', chatId).neq('status', 'ended');

    const { data, error } = await supabase.from('calls').insert({
      chat_id: chatId,
      caller_id: callerId,
      receiver_id: receiverId,
      type,
      status: 'calling'
    }).select().single();

    if (error) throw error;
    return { success: true, callId: data.id };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function endCallAction(callId: string) {
  const supabase = getSupabaseAdmin();
  try {
    const { error } = await supabase.from('calls').update({ status: 'ended' }).eq('id', callId);
    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function checkCallBalanceAction(uid: string, type: 'video' | 'voice') {
  const supabase = getSupabaseAdmin();
  try {
    const { data: user } = await supabase.from('users').select('is_owner, is_coin_seller').eq('uid', uid).single();
    if (user?.is_owner || user?.is_coin_seller) return { success: true };

    const { data: bal } = await supabase.from('balances').select('coins').eq('user_id', uid).single();
    const cost = type === 'video' ? 150 : 70;

    if ((Number(bal?.coins) || 0) < cost) {
      return { success: false, error: "Insufficient coins for call." };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: "Balance check failed." };
  }
}

export async function deductCallCoinsAction(uid: string, type: 'video' | 'voice', partnerId: string) {
  const supabase = getSupabaseAdmin();
  try {
    const { data: user } = await supabase.from('users').select('is_owner, is_coin_seller, gender, name').eq('uid', uid).single();
    
    const cost = type === 'video' ? 150 : 70;
    const ts = Date.now();

    if (!user?.is_owner && !user?.is_coin_seller) {
      const { error: deductError } = await supabase.rpc("increment_coins", { p_user_id: uid, p_amount: -cost });
      if (deductError) throw deductError;

      await supabase.from("coin_history").insert({
        user_id: uid,
        amount: -cost,
        type: "call_cost",
        description: `${type.toUpperCase()} Call Minute`,
        timestamp: ts
      });
    }

    const { data: recipient } = await supabase.from('users').select('gender').eq('uid', partnerId).single();
    if (user?.gender === 'male' && recipient?.gender === 'female') {
      const reward = 50; 
      await supabase.rpc("increment_diamonds", { p_user_id: partnerId, p_amount: reward });
      await supabase.from("diamond_history").insert({
        user_id: partnerId,
        amount: reward,
        type: "call_earning",
        description: `Call from ${user?.name || 'User'}`,
        timestamp: ts
      });
    }

    return { success: true };
  } catch (error: any) {
    console.error("[Call Billing Error]:", error.message);
    return { success: false, error: error.message };
  }
}
