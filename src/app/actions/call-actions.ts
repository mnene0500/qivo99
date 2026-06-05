
'use server';

import { getSupabaseAdmin } from '@/lib/supabase';
import { RtcTokenBuilder, RtcRole } from 'agora-token';

/**
 * @fileOverview Hardened Agora Token Generation and Billing Engine.
 * Fixed: Sanitizes channelName and handles aggregated coin history.
 */

export async function generateAgoraTokenAction(chatId: string, uid: string) {
  const appId = process.env.AGORA_APP_ID;
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;

  if (!appId || !appCertificate) {
    throw new Error("Agora Credentials missing in Vercel Settings.");
  }

  const sanitizedChannelName = chatId.length > 64 
    ? `ch_${chatId.slice(-60)}` 
    : chatId;

  const numericUid = Math.abs(uid.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a }, 0)) >>> 0;
  const role = RtcRole.PUBLISHER;
  const expirationTimeInSeconds = 3600;
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

  const token = RtcTokenBuilder.buildTokenWithUid(
    appId,
    appCertificate,
    sanitizedChannelName,
    numericUid,
    role,
    privilegeExpiredTs,
    privilegeExpiredTs
  );

  return {
    appId,
    token,
    channelName: sanitizedChannelName,
    uid: numericUid
  };
}

export async function startCallAction(chatId: string, callerId: string, receiverId: string, type: 'video' | 'voice') {
  const supabase = getSupabaseAdmin();
  try {
    const { data: receiver } = await supabase.from('users').select('is_dnd, name').eq('uid', receiverId).single();
    if (receiver?.is_dnd) {
      return { success: false, error: `${receiver.name} has activated Do Not Disturb.` };
    }

    // REAL-TIME BUSY CHECK: Only look at calls from the last 2 minutes
    const twoMinsAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: activeCalls } = await supabase
      .from('calls')
      .select('id, status, created_at')
      .or(`caller_id.eq.${receiverId},receiver_id.eq.${receiverId}`)
      .in('status', ['calling', 'active'])
      .gt('created_at', twoMinsAgo);
    
    // Ignore ringing calls older than 45 seconds
    const validBusyCall = activeCalls?.find(c => {
      if (c.status === 'active') return true;
      const createdAt = new Date(c.created_at).getTime();
      return (Date.now() - createdAt) < 45000; 
    });

    if (validBusyCall) {
      return { success: false, error: `${receiver?.name || 'User'} is currently on another call.` };
    }

    const cost = type === 'video' ? 150 : 70;
    const { data: user } = await supabase.from('users').select('is_admin, is_coin_seller').eq('uid', callerId).single();
    
    if (!user?.is_admin && !user?.is_coin_seller) {
      const { data: bal } = await supabase.from('balances').select('coins').eq('user_id', callerId).single();
      if ((Number(bal?.coins) || 0) < cost) {
        return { success: false, error: "Insufficient coins for the first minute." };
      }
    }

    // Force end any stale calls by the caller
    await supabase.from('calls').update({ status: 'ended' }).eq('caller_id', callerId).neq('status', 'ended');

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

export async function endCallAction(payload: {
  callId: string;
  logReason?: 'Cancelled' | 'Rejected' | 'No Answer' | string;
  totalCost?: number;
  totalDiamonds?: number;
  partnerName?: string;
}) {
  const supabase = getSupabaseAdmin();
  try {
    const { data: call } = await supabase
      .from('calls')
      .update({ status: 'ended' })
      .eq('id', payload.callId)
      .select()
      .single();
    
    if (call) {
      const timestamp = Date.now();
      const text = payload.logReason ? `[${payload.logReason}]` : '[Call Ended]';
      
      // 1. Log to Chat History
      await supabase.from('chats').upsert({ 
        id: call.chat_id,
        last_message: text, 
        last_message_at: timestamp, 
        participant_ids: [call.caller_id, call.receiver_id],
        last_sender_id: call.caller_id,
        updated_at: new Date().toISOString()
      });

      await supabase.from('messages').insert({ 
        chat_id: call.chat_id, 
        sender_id: call.caller_id, 
        text, 
        timestamp 
      });

      // 2. Aggregate Coin History (One entry for the whole call)
      if (payload.totalCost && payload.totalCost > 0) {
        await supabase.from('coin_history').insert({
          user_id: call.caller_id,
          amount: -payload.totalCost,
          type: 'call_cost',
          description: `Call with ${payload.partnerName || 'User'}`,
          timestamp: Date.now()
        });
      }

      // 3. Aggregate Diamond History
      if (payload.totalDiamonds && payload.totalDiamonds > 0) {
        await supabase.from('diamond_history').insert({
          user_id: call.receiver_id,
          amount: payload.totalDiamonds,
          type: 'call_earning',
          description: `Call from ${payload.partnerName || 'Admirer'}`,
          timestamp: Date.now()
        });
      }
    }
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deductCallCoinsAction(uid: string, type: 'video' | 'voice', partnerId: string) {
  const supabase = getSupabaseAdmin();
  try {
    const { data: user } = await supabase.from('users').select('is_admin, is_coin_seller, gender, name').eq('uid', uid).single();
    if (user?.is_admin || user?.is_coin_seller) return { success: true };

    const cost = type === 'video' ? 150 : 70;
    
    // Deduct coins silently (No history record here, history is aggregated in endCallAction)
    const { error: deductError } = await supabase.rpc("increment_coins", { p_user_id: uid, p_amount: -cost });
    if (deductError) return { success: false, error: "insufficient_funds" };

    const { data: recipient } = await supabase.from('users').select('gender').eq('uid', partnerId).single();
    let diamondReward = 0;
    if (user?.gender === 'male' && recipient?.gender === 'female') {
      diamondReward = Math.floor(cost * 0.4); 
      await supabase.rpc("increment_diamonds", { p_user_id: partnerId, p_amount: diamondReward });
    }

    return { success: true, cost, diamondReward };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
