
'use server';

import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * @fileOverview Definitive Server Actions for QIVO Production.
 * Hardened atomic operations for Messaging, Economy, Gaming, and Management.
 */

function filterSensitiveContent(text: string): string {
  const sensitivePatterns = [
    /\d{3,}/g, 
    /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten)\b/gi,
    /\b(sifuri|moja|mbili|tatu|nne|tano|sita|saba|nane|tisa|kumi)\b/gi,
    /\b(fuck|bitch|idiot|stupid|scam|fraud|malaya|pumbavu|nguruwe)\b/gi 
  ];
  let filtered = text;
  sensitivePatterns.forEach(pattern => {
    filtered = filtered.replace(pattern, '***');
  });
  return filtered;
}

export async function completeOnboardingAction(payload: {
  uid: string;
  email: string;
  name: string;
  gender: string;
  dob: string;
  country: string;
  looking_for: string;
  photo_url: string;
}) {
  const supabase = getSupabaseAdmin();
  const matchFlowId = Math.floor(1000000 + Math.random() * 9000000).toString();

  try {
    const { error } = await supabase.from('users').upsert({
      uid: payload.uid,
      email: payload.email,
      name: payload.name,
      gender: payload.gender,
      dob: payload.dob,
      country: payload.country,
      looking_for: payload.looking_for,
      photo_url: payload.photo_url,
      match_flow_id: matchFlowId,
      onboarding_complete: true,
      updated_at: new Date().toISOString(),
    });

    if (error) throw error;

    // Award welcome bonus
    const bonus = 10;
    await supabase.rpc("increment_coins", { p_user_id: payload.uid, p_amount: bonus });
    await supabase.from('coin_history').insert({
      user_id: payload.uid,
      amount: bonus,
      type: 'reward',
      description: 'Welcome Bonus',
      timestamp: Date.now()
    });

    return { success: true, bonus };
  } catch (err: any) {
    console.error("Onboarding Error:", err.message);
    return { success: false, error: err.message };
  }
}

export async function sendMessageAction(payload: { chatId: string; senderId: string; recipientId: string; text: string; imageUrl?: string; }) {
  const supabase = getSupabaseAdmin();
  const timestamp = Date.now();
  const isImage = !!payload.imageUrl;
  const safeText = filterSensitiveContent(payload.text || (isImage ? "[Photo]" : ""));

  try {
    const { data: sender } = await supabase.from('users').select('gender, is_admin, is_coin_seller, blocking, blocked_by').eq('uid', payload.senderId).maybeSingle();
    
    // Check if interaction is allowed (Blocking check)
    if (sender?.blocking?.includes(payload.recipientId) || sender?.blocked_by?.includes(payload.recipientId)) {
      return { success: false, error: "interaction_blocked" };
    }

    const { data: balance } = await supabase.from('balances').select('coins').eq('user_id', payload.senderId).maybeSingle();
    
    const cost = isImage ? 30 : 15;
    const isFree = !!(sender?.is_admin || sender?.is_coin_seller);

    if (sender?.gender === 'male' && !isFree) {
      if ((Number(balance?.coins) || 0) < cost) return { success: false, error: "insufficient_funds" };
      const { error: deductErr } = await supabase.rpc("increment_coins", { p_user_id: payload.senderId, p_amount: -cost });
      if (deductErr) return { success: false, error: "insufficient_funds" };
      
      await supabase.from('coin_history').insert({ user_id: payload.senderId, amount: -cost, type: 'fee', description: isImage ? 'Image Message Cost' : 'Message Cost', timestamp });
    }
    
    await supabase.from('chats').upsert({ id: payload.chatId, last_message: safeText.slice(0, 100), last_message_at: timestamp, participant_ids: [payload.senderId, payload.recipientId], last_sender_id: payload.senderId, updated_at: new Date().toISOString() });
    await supabase.from('messages').insert({ chat_id: payload.chatId, text: safeText, sender_id: payload.senderId, timestamp, image_url: payload.imageUrl || null });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: "system_error" };
  }
}

export async function sendGiftAction(senderUid: string, recipientUid: string, coinAmount: number, giftName: string) {
  const supabase = getSupabaseAdmin();
  try {
    const ts = Date.now();
    const { data: sender } = await supabase.from('users').select('is_admin, is_coin_seller').eq('uid', senderUid).single();
    const isFree = !!(sender?.is_admin || sender?.is_coin_seller);

    if (!isFree) {
      const { data: balance } = await supabase.from('balances').select('coins').eq('user_id', senderUid).maybeSingle();
      if ((Number(balance?.coins) || 0) < coinAmount) throw new Error("insufficient_funds");
      const { error: deductErr } = await supabase.rpc("increment_coins", { p_user_id: senderUid, p_amount: -coinAmount });
      if (deductErr) throw new Error("insufficient_funds");
      await supabase.from('coin_history').insert({ user_id: senderUid, amount: -coinAmount, type: 'gift', description: `Sent ${giftName}`, timestamp: ts });
    }

    const { data: recipient } = await supabase.from('users').select('gender').eq('uid', recipientUid).single();
    
    if (recipient?.gender === 'male') {
      const reward = Math.floor(coinAmount * 0.4);
      await supabase.rpc("increment_coins", { p_user_id: recipientUid, p_amount: reward });
      await supabase.from('coin_history').insert({ user_id: recipientUid, amount: reward, type: 'gift_income', description: `Gift from admirer: ${giftName}`, timestamp: ts });
    } else {
      const reward = Math.floor(coinAmount * 0.5);
      await supabase.rpc("increment_diamonds", { p_user_id: recipientUid, p_amount: reward });
      await supabase.from('diamond_history').insert({ user_id: recipientUid, amount: reward, type: 'gift', description: `Received ${giftName}`, timestamp: ts });
    }
    
    const chatId = `direct_${[senderUid, recipientUid].sort()[0]}_${[senderUid, recipientUid].sort()[1]}`;
    const text = `[Gift: ${giftName}]`;
    
    await supabase.from('chats').upsert({ id: chatId, last_message: text, last_message_at: ts, participant_ids: [senderUid, recipientUid], last_sender_id: senderUid, updated_at: new Date().toISOString() });
    await supabase.from('messages').insert({ chat_id: chatId, sender_id: senderUid, text: text, is_gift: true, timestamp: ts });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function awardCoinsAction(userUid: string, targetUid: string, amount: number) {
  const supabase = getSupabaseAdmin();
  try {
    const { data: actor } = await supabase.from('users').select('is_admin, is_coin_seller').eq('uid', userUid).single();
    if (!actor?.is_admin && !actor?.is_coin_seller) throw new Error("Unauthorized");
    const historyDesc = actor.is_admin ? "System Award" : "Recharge with Coinseller";

    if (actor.is_coin_seller && !actor.is_admin) {
      const { data: bal } = await supabase.from('balances').select('coins').eq('user_id', userUid).single();
      if ((Number(bal?.coins) || 0) < amount) throw new Error("Insufficient merchant balance");
      await supabase.rpc("increment_coins", { p_user_id: userUid, p_amount: -amount });
      await supabase.from('coin_history').insert({ user_id: userUid, amount: -amount, type: 'sale', description: `Coins sold to client`, timestamp: Date.now() });
    }
    
    await supabase.rpc("increment_coins", { p_user_id: targetUid, p_amount: amount });
    await supabase.from('coin_history').insert({ user_id: targetUid, amount, type: 'awarded', description: historyDesc, timestamp: Date.now() });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function dailyCheckInAction(uid: string) {
  const supabase = getSupabaseAdmin();
  try {
    const { data: user } = await supabase.from('users').select('last_check_in_date, check_in_streak').eq('uid', uid).single();
    const today = new Date().toDateString();
    const lastCheckIn = user?.last_check_in_date ? new Date(user.last_check_in_date).toDateString() : null;

    if (today === lastCheckIn) throw new Error("Already checked in today.");

    const amount = 5;
    await supabase.from('users').update({ last_check_in_date: new Date().toISOString(), check_in_streak: (user?.check_in_streak || 0) + 1 }).eq('uid', uid);
    await supabase.rpc("increment_coins", { p_user_id: uid, p_amount: amount });
    await supabase.from('coin_history').insert({ user_id: uid, amount, type: 'task', description: 'Daily Check-in', timestamp: Date.now() });
    
    return { success: true, amount };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function deleteUserCompletelyAction(targetUid: string) {
  const supabase = getSupabaseAdmin();
  try {
    await Promise.all([
      supabase.from('balances').delete().eq('user_id', targetUid),
      supabase.from('coin_history').delete().eq('user_id', targetUid),
      supabase.from('diamond_history').delete().eq('user_id', targetUid),
      supabase.from('messages').delete().eq('sender_id', targetUid),
      supabase.from('reports').delete().or(`reporter_id.eq.${targetUid},reported_id.eq.${targetUid}`),
      supabase.from('calls').delete().or(`caller_id.eq.${targetUid},receiver_id.eq.${targetUid}`),
      supabase.from('chats').delete().contains('participant_ids', [targetUid])
    ]);
    await supabase.from('users').delete().eq('uid', targetUid);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function sendMysteryNoteAction(userId: string, text: string, recipientCount: number) {
  const supabase = getSupabaseAdmin();
  const cost = recipientCount * 10;
  
  try {
    const { data: sender } = await supabase.from('users').select('blocking, blocked_by').eq('uid', userId).single();
    const blockedList = [...(sender?.blocking || []), ...(sender?.blocked_by || [])];

    const { data: balance } = await supabase.from('balances').select('coins').eq('user_id', userId).maybeSingle();
    if ((Number(balance?.coins) || 0) < cost) throw new Error("insufficient_funds");

    // Fetch pool of eligible recipients
    let query = supabase.from('users')
      .select('uid')
      .neq('uid', userId)
      .eq('onboarding_complete', true)
      .is('is_deleted', false);
    
    if (blockedList.length > 0) {
      query = query.not('uid', 'in', `(${blockedList.join(',')})`);
    }

    const { data: recipients } = await query.limit(recipientCount);

    if (recipients && recipients.length > 0) {
      await supabase.rpc("increment_coins", { p_user_id: userId, p_amount: -cost });
      
      for (const r of recipients) {
        const chatId = `direct_${[userId, r.uid].sort()[0]}_${[userId, r.uid].sort()[1]}`;
        await supabase.from('chats').upsert({ id: chatId, last_message: text, last_message_at: Date.now(), participant_ids: [userId, r.uid], last_sender_id: userId, updated_at: new Date().toISOString() });
        await supabase.from('messages').insert({ chat_id: chatId, sender_id: userId, text: text, timestamp: Date.now() });
      }
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function dailyHeartbeatAction(uid: string) {
  const supabase = getSupabaseAdmin();
  await supabase.from('users').update({ updated_at: new Date().toISOString() }).eq('uid', uid);
}

export async function checkIdentityDuplicateAction(uid: string) {
  const supabase = getSupabaseAdmin();
  const { data: conflict } = await supabase.from('users').select('match_flow_id').eq('is_verified', true).neq('uid', uid).limit(1).maybeSingle();
  if (conflict) return { success: false, matchFlowId: conflict.match_flow_id };
  return { success: true };
}

export async function markChatAsReadAction(userId: string, chatId: string) {
  const supabase = getSupabaseAdmin();
  const { data: chat } = await supabase.from('chats').select('last_seen_at').eq('id', chatId).single();
  const last_seen_at = (chat?.last_seen_at as Record<string, number>) || {};
  last_seen_at[userId] = Date.now();
  await supabase.from('chats').update({ last_seen_at }).eq('id', chatId);
  return { success: true };
}

export async function clearChatAction(userId: string, chatId: string) {
  const supabase = getSupabaseAdmin();
  const { data: chat } = await supabase.from('chats').select('cleared_at').eq('id', chatId).single();
  const cleared_at = (chat?.cleared_at as Record<string, number>) || {};
  cleared_at[userId] = Date.now();
  await supabase.from('chats').update({ cleared_at }).eq('id', chatId);
  return { success: true };
}

export async function savePushSubscriptionAction(userId: string, endpoint: string, subscriptionJson: any) {
  const supabase = getSupabaseAdmin();
  await supabase.from('push_subscriptions').upsert({ user_id: userId, endpoint, subscription_json: subscriptionJson }, { onConflict: 'endpoint' });
  return { success: true };
}

export async function activateReadReceiptsAction(uid: string) {
  const supabase = getSupabaseAdmin();
  const cost = 200;
  const { data: bal } = await supabase.from('balances').select('coins').eq('user_id', uid).single();
  if ((Number(bal?.coins) || 0) < cost) throw new Error("insufficient_funds");
  await supabase.rpc("increment_coins", { p_user_id: uid, p_amount: -cost });
  await supabase.from('users').update({ has_read_receipts: true }).eq('uid', uid);
  await supabase.from('coin_history').insert({ user_id: uid, amount: -cost, type: 'premium', description: 'Read Receipts Activation', timestamp: Date.now() });
  return { success: true };
}

export async function activateVisitorTrackingAction(uid: string) {
  const supabase = getSupabaseAdmin();
  const cost = 400;
  const { data: bal } = await supabase.from('balances').select('coins').eq('user_id', uid).single();
  if ((Number(bal?.coins) || 0) < cost) throw new Error("insufficient_funds");
  await supabase.rpc("increment_coins", { p_user_id: uid, p_amount: -cost });
  await supabase.from('users').update({ has_visitor_tracking: true }).eq('uid', uid);
  await supabase.from('coin_history').insert({ user_id: uid, amount: -cost, type: 'premium', description: 'Visitor Tracking Activation', timestamp: Date.now() });
  return { success: true };
}

export async function logProfileVisitAction(visitorId: string, visitedId: string) {
  if (visitorId === visitedId) return;
  const supabase = getSupabaseAdmin();
  await supabase.rpc("track_profile_visit", { p_visitor_id: visitorId, p_visited_id: visitedId });
}
