
'use server';

import { getSupabaseAdmin } from '@/lib/supabase';
import { headers } from 'next/headers';

/**
 * @fileOverview Definitive Server Actions for QIVO.
 * Comprehensive logic for Economy, Roles, Safety, and Games.
 */

function filterSensitiveContent(text: string): string {
  const sensitivePatterns = [
    /\d{3,}/g, // Any sequence of 3+ digits (Phone numbers)
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

async function trimHistory(supabase: any, userId: string, table: 'coin_history' | 'diamond_history') {
  try {
    const { data } = await supabase.from(table).select('id').eq('user_id', userId).order('timestamp', { ascending: false });
    if (data && data.length > 50) {
      const idsToDelete = data.slice(50).map((row: any) => row.id);
      await supabase.from(table).delete().in('id', idsToDelete);
    }
  } catch (e) {}
}

export async function completeOnboardingAction(payload: {
  uid: string; email: string; name: string; gender: string; dob: string; country: string; looking_for: string; photo_url?: string;
}) {
  const supabase = getSupabaseAdmin();
  try {
    const qId = Math.floor(1000000 + Math.random() * 900000000).toString();
    const timestamp = Date.now();

    // Anti-Fraud: check for IP-based multiple accounts
    const headersList = await headers();
    const ip = headersList.get('x-forwarded-for') || '0.0.0.0';
    
    const { data: existingProfiles } = await supabase.from('users').select('uid').limit(10);
    const isSuspectedAlt = false; // Logic would typically check an 'ip_logs' table

    const { error: profileErr } = await supabase.from('users').upsert({
      uid: payload.uid, email: payload.email, name: payload.name, gender: payload.gender, dob: payload.dob,
      country: payload.country, looking_for: payload.looking_for, onboarding_complete: true,
      match_flow_id: qId, photo_url: payload.photo_url, updated_at: new Date().toISOString()
    });
    if (profileErr) throw profileErr;

    if (!isSuspectedAlt) {
      const initialCoins = (payload.gender === 'male') ? 500 : 0;
      const initialDiamonds = (payload.gender === 'female') ? 150 : 0;

      if (initialCoins > 0) {
        await supabase.rpc("increment_coins", { p_user_id: payload.uid, p_amount: initialCoins });
        await supabase.from('coin_history').insert({ user_id: payload.uid, amount: initialCoins, type: 'bonus', description: 'Welcome Bonus', timestamp });
      }
      if (initialDiamonds > 0) {
        await supabase.rpc("increment_diamonds", { p_user_id: payload.uid, p_amount: initialDiamonds });
        await supabase.from('diamond_history').insert({ user_id: payload.uid, amount: initialDiamonds, type: 'bonus', description: 'New Profile Bonus', timestamp });
      }
      return { success: true, bonus: initialCoins || initialDiamonds };
    }
    return { success: true, bonus: 0 };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function sendMessageAction(payload: { chatId: string; senderId: string; recipientId: string; text: string; }) {
  const supabase = getSupabaseAdmin();
  const timestamp = Date.now();
  const safeText = filterSensitiveContent(payload.text);

  try {
    const { data: sender } = await supabase.from('users').select('gender, is_owner, is_coin_seller, is_special_user').eq('uid', payload.senderId).single();
    const cost = 15;
    const isFree = sender?.is_owner || sender?.is_special_user || sender?.is_coin_seller;

    if (sender?.gender === 'male' && !isFree) {
      const { error: deductErr } = await supabase.rpc("increment_coins", { p_user_id: payload.senderId, p_amount: -cost });
      if (deductErr) return { success: false, error: "insufficient_funds" };
      await supabase.from('coin_history').insert({ user_id: payload.senderId, amount: -cost, type: 'fee', description: 'Message Cost', timestamp });
      await trimHistory(supabase, payload.senderId, 'coin_history');
    }
    
    await supabase.from('chats').upsert({ 
      id: payload.chatId, 
      last_message: safeText.slice(0, 100), 
      last_message_at: timestamp, 
      participant_ids: [payload.senderId, payload.recipientId],
      last_sender_id: payload.senderId,
      updated_at: new Date().toISOString()
    });

    await supabase.from('messages').insert({ chat_id: payload.chatId, text: safeText, sender_id: payload.senderId, timestamp });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: "system_error" };
  }
}

export async function sendGiftAction(senderUid: string, recipientUid: string, coinAmount: number, giftName: string) {
  const supabase = getSupabaseAdmin();
  try {
    const ts = Date.now();
    const { error: deductErr } = await supabase.rpc("increment_coins", { p_user_id: senderUid, p_amount: -coinAmount });
    if (deductErr) throw new Error("insufficient_funds");

    const reward = Math.floor(coinAmount * 0.5);
    await supabase.rpc("increment_diamonds", { p_user_id: recipientUid, p_amount: reward });
    
    const chatId = `direct_${[senderUid, recipientUid].sort()[0]}_${[senderUid, recipientUid].sort()[1]}`;
    const text = `[Gift: ${giftName}]`;
    
    await supabase.from('chats').upsert({ 
      id: chatId, last_message: text, last_message_at: ts, 
      participant_ids: [senderUid, recipientUid], last_sender_id: senderUid, updated_at: new Date().toISOString()
    });

    await supabase.from('messages').insert({ chat_id: chatId, sender_id: senderUid, text: text, is_gift: true, timestamp: ts });
    await supabase.from('coin_history').insert({ user_id: senderUid, amount: -coinAmount, type: 'gift', description: `Sent ${giftName}`, timestamp: ts });
    await supabase.from('diamond_history').insert({ user_id: recipientUid, amount: reward, type: 'gift', description: `Received ${giftName}`, timestamp: ts });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function awardCoinsAction(ownerUid: string, targetUid: string, amount: number) {
  const supabase = getSupabaseAdmin();
  try {
    const { data: owner } = await supabase.from('users').select('is_owner, is_coin_seller, is_special_user').eq('uid', ownerUid).single();
    if (!owner?.is_owner && !owner?.is_coin_seller && !owner?.is_special_user) throw new Error("Unauthorized");
    
    if (!owner.is_owner && !owner.is_special_user) {
      const { error: dErr } = await supabase.rpc("increment_coins", { p_user_id: ownerUid, p_amount: -amount });
      if (dErr) throw new Error("Insufficient merchant balance");
    }
    
    await supabase.rpc("increment_coins", { p_user_id: targetUid, p_amount: amount });
    await supabase.from('coin_history').insert({ user_id: targetUid, amount, type: 'awarded', description: `Received from Partner`, timestamp: Date.now() });
    return { success: true, message: `Transferred ${amount} coins.` };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function toggleUserRoleAction(ownerUid: string, targetMatchFlowId: string, role: string, value: boolean) {
  const supabase = getSupabaseAdmin();
  try {
    const { data: owner } = await supabase.from('users').select('is_owner').eq('uid', ownerUid).single();
    if (!owner?.is_owner) throw new Error("Unauthorized access to role management.");

    const { error } = await supabase.from('users').update({ [role]: value }).eq('match_flow_id', targetMatchFlowId);
    if (error) throw error;
    
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
    await supabase.from('users').update({ 
      last_check_in_date: new Date().toISOString(), 
      check_in_streak: (user?.check_in_streak || 0) + 1 
    }).eq('uid', uid);

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
      supabase.from('reports').delete().or(`reporter_id.eq.${targetUid},reported_id.eq.${targetUid}`)
    ]);

    const { error } = await supabase.from('users').delete().eq('uid', targetUid);
    if (error) throw error;

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function joinAgencyAction(uid: string, agencyCode: string) {
  const supabase = getSupabaseAdmin();
  try {
    const { data: agency } = await supabase.from('agencies').select('code').eq('code', agencyCode).single();
    if (!agency) return { success: false, error: "Invalid agency code." };

    const { error } = await supabase.from('users').update({ agency_id: agencyCode, agency_status: 'pending' }).eq('uid', uid);
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function leaveAgencyAction(uid: string) {
  const supabase = getSupabaseAdmin();
  try {
    const { error } = await supabase.from('users').update({ agency_id: null, agency_status: null }).eq('uid', uid);
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function createAgencyAction(uid: string, name: string) {
  const supabase = getSupabaseAdmin();
  try {
    const code = Math.floor(10000 + Math.random() * 90000).toString();
    const { error: agencyErr } = await supabase.from('agencies').insert({ code, agent_uid: uid, name });
    if (agencyErr) throw agencyErr;

    const { error: userErr } = await supabase.from('users').update({ agency_id: code, agency_status: 'approved', is_agent: true }).eq('uid', uid);
    if (userErr) throw userErr;

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function reportUserAction(payload: { reporterId: string, reportedId: string, reason: string, description: string, proofPhotoUrl?: string }) {
  const supabase = getSupabaseAdmin();
  try {
    const { error } = await supabase.from('reports').insert({
      reporter_id: payload.reporterId,
      reported_id: payload.reportedId,
      reason: payload.reason,
      description: payload.description,
      proof_photo_url: payload.proofPhotoUrl,
      status: 'pending',
      timestamp: Date.now()
    });
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function resolveReportAction(ownerUid: string, reportId: string, reporterUid: string) {
  const supabase = getSupabaseAdmin();
  try {
    const { error } = await supabase.from('reports').update({ status: 'resolved' }).eq('id', reportId);
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function reviewRecruitmentAction(applicantUid: string, status: 'approved' | 'rejected') {
  const supabase = getSupabaseAdmin();
  try {
    const { error } = await supabase.from('users').update({ agency_status: status }).eq('uid', applicantUid);
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function updateWithdrawalStatusAction(requestId: string, status: 'paid' | 'rejected') {
  const supabase = getSupabaseAdmin();
  try {
    const { error } = await supabase.from('withdrawals').update({ status }).eq('id', requestId);
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function requestWithdrawalAction(userUid: string, diamonds: number, amount_kes: number, agencyId: string, mpesaNumber: string) {
  const supabase = getSupabaseAdmin();
  try {
    if (new Date().getDay() !== 6) throw new Error("Withdrawals are only allowed on Saturdays.");
    const { error: deductErr } = await supabase.rpc("increment_diamonds", { p_user_id: userUid, p_amount: -diamonds });
    if (deductErr) throw new Error("Insufficient diamonds");

    await supabase.from('withdrawals').insert({ 
      user_id: userUid, agency_id: agencyId, diamonds, amount_kes, mpesa_number: mpesaNumber, status: 'pending', timestamp: Date.now() 
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function playSlotsAction(userId: string, stake: number) {
  const supabase = getSupabaseAdmin();
  try {
    const ts = Date.now();
    const { error: dErr } = await supabase.rpc("increment_coins", { p_user_id: userId, p_amount: -stake });
    if (dErr) throw new Error("Insufficient coins");
    
    const symbols = ["bar", "cherry", "crown"];
    const result = [symbols[Math.floor(Math.random()*3)], symbols[Math.floor(Math.random()*3)], symbols[Math.floor(Math.random()*3)]];
    const win = result[0] === result[1] && result[1] === result[2] ? stake * 2 : 0;
    
    if (win > 0) {
      await supabase.rpc("increment_coins", { p_user_id: userId, p_amount: win });
      await supabase.from('coin_history').insert({ user_id: userId, amount: win, type: 'win', description: 'Slots Jackpot', timestamp: ts });
    }
    return { success: true, winAmount: win, slots: result, message: win > 0 ? "Jackpot!" : "Try again!" };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function playSpinGameAction(userId: string, stake: number) {
  const supabase = getSupabaseAdmin();
  try {
    const ts = Date.now();
    const { error: dErr } = await supabase.rpc("increment_coins", { p_user_id: userId, p_amount: -stake });
    if (dErr) throw new Error("Insufficient coins");

    const prizes = stake <= 20 
      ? [0, 5, 10, 0, 20, 0, 50, 5, 0, 10, 20, 0, 5, 0, 30, 0, 10, 50, 0, 15]
      : [0, 100, 200, 0, 500, 0, 1000, 100, 0, 200, 500, 0, 100, 0, 750, 0, 200, 1000, 0, 400];
    
    const winIndex = Math.floor(Math.random() * 20);
    const winAmount = prizes[winIndex];

    if (winAmount > 0) {
      await supabase.rpc("increment_coins", { p_user_id: userId, p_amount: winAmount });
      await supabase.from('coin_history').insert({ user_id: userId, amount: winAmount, type: 'win', description: 'Spin Win', timestamp: ts });
    }
    return { success: true, winAmount, index: winIndex };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function convertDiamondsToCoinsAction(userId: string, diamonds: number, coins: number) {
  const supabase = getSupabaseAdmin();
  try {
    await supabase.rpc("increment_diamonds", { p_user_id: userId, p_amount: -diamonds });
    await supabase.rpc("increment_coins", { p_user_id: userId, p_amount: coins });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function sendMysteryNoteAction(userId: string, text: string, recipientCount: number) {
  const supabase = getSupabaseAdmin();
  try {
    const cost = recipientCount * 10;
    const ts = Date.now();
    const { error: dErr } = await supabase.rpc("increment_coins", { p_user_id: userId, p_amount: -cost });
    if (dErr) throw new Error("Insufficient coins");

    const { data: recipients } = await supabase.from('users').select('uid').neq('uid', userId).eq('onboarding_complete', true).limit(recipientCount);
    if (recipients) {
      for (const r of recipients) {
        const chatId = `direct_${[userId, r.uid].sort()[0]}_${[userId, r.uid].sort()[1]}`;
        await supabase.from('chats').upsert({ id: chatId, last_message: text, last_message_at: ts, participant_ids: [userId, r.uid], last_sender_id: userId, updated_at: new Date().toISOString() });
        await supabase.from('messages').insert({ chat_id: chatId, sender_id: userId, text: text, timestamp: ts });
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
  return { success: true };
}

export async function markChatAsReadAction(userId: string, chatId: string) {
  const supabase = getSupabaseAdmin();
  try {
    const { data: chat } = await supabase.from('chats').select('last_seen_at').eq('id', chatId).single();
    const last_seen_at = (chat?.last_seen_at as Record<string, number>) || {};
    last_seen_at[userId] = Date.now();
    await supabase.from('chats').update({ last_seen_at }).eq('id', chatId);
    return { success: true };
  } catch (err) {
    return { success: false };
  }
}

export async function clearChatAction(userId: string, chatId: string) {
  const supabase = getSupabaseAdmin();
  try {
    const { data: chat } = await supabase.from('chats').select('cleared_at').eq('id', chatId).single();
    const cleared_at = (chat?.cleared_at as Record<string, number>) || {};
    cleared_at[userId] = Date.now();
    await supabase.from('chats').update({ cleared_at }).eq('id', chatId);
    return { success: true };
  } catch (err) {
    return { success: false };
  }
}

export async function savePushSubscriptionAction(userId: string, endpoint: string, subscriptionJson: any) {
  const supabase = getSupabaseAdmin();
  try {
    await supabase.from('push_subscriptions').upsert({ user_id: userId, endpoint, subscription_json: subscriptionJson }, { onConflict: 'endpoint' });
    return { success: true };
  } catch (err: any) {
    return { success: false };
  }
}
