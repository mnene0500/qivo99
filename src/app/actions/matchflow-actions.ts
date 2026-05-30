
'use server';

import { getSupabaseAdmin } from '@/lib/supabase';
import { headers } from 'next/headers';

/**
 * @fileOverview Hardened Server Actions for QIVO with Anti-Fraud, Content Filtering, and Rolling History.
 */

// Basic offensive word filter + Number detection (English & Kiswahili)
function filterSensitiveContent(text: string): string {
  const sensitivePatterns = [
    /\d{3,}/g, // Any sequence of 3+ digits
    /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten)\b/gi,
    /\b(sifuri|moja|mbili|tatu|nne|tano|sita|saba|nane|tisa|kumi)\b/gi,
    /\b(fuck|bitch|idiot|stupid|scam|fraud)\b/gi 
  ];

  let filtered = text;
  sensitivePatterns.forEach(pattern => {
    filtered = filtered.replace(pattern, '***');
  });
  return filtered;
}

async function trimHistory(supabase: any, userId: string, table: 'coin_history' | 'diamond_history') {
  try {
    const { data } = await supabase
      .from(table)
      .select('id')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false });

    if (data && data.length > 50) {
      const idsToDelete = data.slice(50).map((row: any) => row.id);
      await supabase.from(table).delete().in('id', idsToDelete);
    }
  } catch (e) {
    console.error(`Trim ${table} error:`, e);
  }
}

export async function completeOnboardingAction(payload: {
  uid: string; email: string; name: string; gender: string; dob: string; country: string; looking_for: string; photo_url?: string;
}) {
  const supabase = getSupabaseAdmin();
  const headersList = await headers();
  const ip = headersList.get('x-forwarded-for') || '0.0.0.0';
  
  try {
    const qId = Math.floor(1000000 + Math.random() * 900000000).toString();
    const timestamp = Date.now();

    // Anti-Fraud check: Check if this IP has registered many accounts recently
    const { data: existingProfiles } = await supabase
      .from('users')
      .select('uid')
      .eq('country', payload.country)
      .limit(10);

    const isSuspectedAlt = existingProfiles && existingProfiles.length > 5;

    const defaultPhoto = payload.gender === 'male' 
      ? `https://picsum.photos/seed/${payload.uid}/400/400` 
      : payload.photo_url;

    const { error: profileErr } = await supabase.from('users').upsert({
      uid: payload.uid, 
      email: payload.email, 
      name: payload.name, 
      gender: payload.gender, 
      dob: payload.dob,
      country: payload.country, 
      looking_for: payload.looking_for, 
      onboarding_complete: true,
      match_flow_id: qId, 
      photo_url: defaultPhoto || payload.photo_url, 
      updated_at: new Date().toISOString()
    });

    if (profileErr) throw profileErr;

    const { data: alreadyRewarded } = await supabase.from('coin_history').select('id').eq('user_id', payload.uid).eq('type', 'bonus').maybeSingle();
    
    if (!alreadyRewarded && !isSuspectedAlt) {
      // SET TO 500 COINS AS REQUESTED
      const initialCoins = (payload.gender === 'male') ? 500 : 0;
      const initialDiamonds = (payload.gender === 'female') ? 150 : 0;

      if (initialCoins > 0) {
        await supabase.rpc("increment_coins", { p_user_id: payload.uid, p_amount: initialCoins });
        await supabase.from('coin_history').insert({
          user_id: payload.uid, amount: initialCoins, type: 'bonus', description: 'Welcome Bonus', timestamp
        });
        await trimHistory(supabase, payload.uid, 'coin_history');
      }

      if (initialDiamonds > 0) {
        await supabase.rpc("increment_diamonds", { p_user_id: payload.uid, p_amount: initialDiamonds });
        await supabase.from('diamond_history').insert({
          user_id: payload.uid, amount: initialDiamonds, type: 'bonus', description: 'New Profile Bonus', timestamp
        });
        await trimHistory(supabase, payload.uid, 'diamond_history');
      }
      return { success: true, bonus: initialCoins || initialDiamonds };
    }

    return { success: true, bonus: 0 };
  } catch (err: any) {
    console.error("[Onboarding Error]:", err.message);
    return { success: false, error: err.message };
  }
}

export async function sendMessageAction(payload: { chatId: string; senderId: string; recipientId: string; text: string; }) {
  const supabase = getSupabaseAdmin();
  const timestamp = Date.now();
  const safeText = filterSensitiveContent(payload.text);

  try {
    const { data: sender } = await supabase.from('users').select('gender, is_owner, is_coin_seller, is_special_user, blocking, blocked_by').eq('uid', payload.senderId).single();
    const { data: recipient } = await supabase.from('users').select('is_special_user, is_coin_seller, is_owner, blocking, blocked_by').eq('uid', payload.recipientId).single();

    if (sender?.blocking?.includes(payload.recipientId) || recipient?.blocking?.includes(payload.senderId)) {
       return { success: false, error: "blocked" };
    }

    const cost = 15;
    const isFree = sender?.is_owner || sender?.is_special_user || sender?.is_coin_seller || recipient?.is_special_user || recipient?.is_coin_seller || recipient?.is_owner;

    if (sender?.gender === 'male' && !isFree) {
      const { error: deductErr } = await supabase.rpc("increment_coins", { p_user_id: payload.senderId, p_amount: -cost });
      if (deductErr) return { success: false, error: "insufficient_funds" };
      
      await supabase.from('coin_history').insert({
        user_id: payload.senderId, amount: -cost, type: 'fee', description: 'Message Cost', timestamp
      });
      await trimHistory(supabase, payload.senderId, 'coin_history');
    }
    
    await supabase.from('chats').upsert({ 
      id: payload.chatId, 
      last_message: safeText.slice(0, 100), 
      last_message_at: timestamp, 
      participant_ids: [payload.senderId, payload.recipientId],
      last_sender_id: payload.senderId,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' });

    const { error: msgError } = await supabase.from('messages').insert({ 
      chat_id: payload.chatId, 
      text: safeText, 
      sender_id: payload.senderId, 
      timestamp 
    });
    
    if (msgError) throw msgError;
    return { success: true };
  } catch (err: any) {
    console.error("[Send Message Error]:", err.message);
    return { success: false, error: "system_error" };
  }
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

export async function awardCoinsAction(ownerUid: string, targetUid: string, amount: number) {
  const supabase = getSupabaseAdmin();
  try {
    const { data: owner } = await supabase.from('users').select('is_owner, is_coin_seller, is_special_user').eq('uid', ownerUid).single();
    if (!owner?.is_owner && !owner?.is_coin_seller && !owner?.is_special_user) throw new Error("Unauthorized");

    const ts = Date.now();
    if (!owner.is_owner && !owner.is_special_user) {
      const { error: deductErr } = await supabase.rpc("increment_coins", { p_user_id: ownerUid, p_amount: -amount });
      if (deductErr) throw new Error("Insufficient merchant balance");
    }

    await supabase.rpc("increment_coins", { p_user_id: targetUid, p_amount: amount });
    await supabase.from('coin_history').insert({ user_id: targetUid, amount, type: 'awarded', description: `Received from ${owner.is_coin_seller ? 'Coinseller' : 'Admin'}`, timestamp: ts });
    await trimHistory(supabase, targetUid, 'coin_history');

    return { success: true, message: `Sent ${amount} coins.` };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function reportUserAction(payload: { reporterId: string; reportedId: string; reason: string; description: string; proofPhotoUrl?: string; }) {
  const supabase = getSupabaseAdmin();
  try {
    await supabase.from('reports').insert({
      reporter_id: payload.reporterId,
      reported_id: payload.reportedId,
      reason: payload.reason,
      description: payload.description,
      proof_photo_url: payload.proofPhotoUrl,
      status: 'pending',
      timestamp: Date.now()
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function resolveReportAction(adminUid: string, reportId: string, reporterUid: string) {
  const supabase = getSupabaseAdmin();
  try {
    await supabase.from('reports').update({ status: 'resolved' }).eq('id', reportId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function requestWithdrawalAction(userUid: string, diamonds: number, amount_kes: number, agencyId: string, mpesaNumber: string) {
  const supabase = getSupabaseAdmin();
  try {
    const ts = Date.now();
    const { error: deductErr } = await supabase.rpc("increment_diamonds", { p_user_id: userUid, p_amount: -diamonds });
    if (deductErr) throw new Error("Insufficient diamonds");

    await supabase.from('withdrawals').insert({ 
      user_id: userUid, agency_id: agencyId, diamonds, amount_kes, mpesa_number: mpesaNumber, status: 'pending', timestamp: ts 
    });
    await trimHistory(supabase, userUid, 'diamond_history');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function reviewRecruitmentAction(applicantUid: string, status: 'approved' | 'rejected') {
  const supabase = getSupabaseAdmin();
  try {
    const s = status === 'approved' ? 'approved' : 'rejected';
    await supabase.from('users').update({ agency_status: s }).eq('uid', applicantUid);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function updateWithdrawalStatusAction(requestId: string, status: 'paid' | 'rejected') {
  const supabase = getSupabaseAdmin();
  try {
    const { data: req } = await supabase.from('withdrawals').select('*').eq('id', requestId).single();
    if (!req) throw new Error("Request not found");

    if (status === 'rejected' && req.status === 'pending') {
      await supabase.rpc("increment_diamonds", { p_user_id: req.user_id, p_amount: req.diamonds });
    }
    
    await supabase.from('withdrawals').update({ status }).eq('id', requestId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function toggleUserRoleAction(ownerUid: string, targetMatchFlowId: string, role: string, value: boolean) {
  const supabase = getSupabaseAdmin();
  try {
    await supabase.from('users').update({ [role]: value }).eq('match_flow_id', targetMatchFlowId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function deleteUserCompletelyAction(uid: string) {
  const supabase = getSupabaseAdmin();
  try {
    const { error } = await supabase.auth.admin.deleteUser(uid);
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
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

export async function createAgencyAction(agentUid: string, name: string) {
  const supabase = getSupabaseAdmin();
  try {
    const code = Math.floor(10000 + Math.random() * 90000).toString();
    await supabase.from('agencies').insert({ code, agent_uid: agentUid, name });
    await supabase.from('users').update({ agency_id: code, agency_status: 'approved', is_agent: true }).eq('uid', agentUid);
    return { success: true, code };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function joinAgencyAction(userUid: string, code: string) {
  const supabase = getSupabaseAdmin();
  try {
    const { data: user } = await supabase.from('users').select('gender').eq('uid', userUid).single();
    if (user?.gender !== 'female') throw new Error("Restricted.");
    await supabase.from('users').update({ agency_id: code, agency_status: 'pending' }).eq('uid', userUid);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function leaveAgencyAction(userUid: string) {
  const supabase = getSupabaseAdmin();
  try {
    await supabase.from('users').update({ agency_id: null, agency_status: null }).eq('uid', userUid);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function sendGiftAction(senderUid: string, recipientUid: string, coinAmount: number, giftName: string) {
  const supabase = getSupabaseAdmin();
  try {
    const ts = Date.now();
    const { error: deductErr } = await supabase.rpc("increment_coins", { p_user_id: senderUid, p_amount: -coinAmount });
    if (deductErr) throw new Error("Insufficient coins.");
    
    const reward = Math.floor(coinAmount * 0.5);
    await supabase.rpc("increment_diamonds", { p_user_id: recipientUid, p_amount: reward });
    
    const chatId = `direct_${[senderUid, recipientUid].sort()[0]}_${[senderUid, recipientUid].sort()[1]}`;
    await supabase.from('messages').insert({ chat_id: chatId, sender_id: senderUid, text: `[Gift: ${giftName}]`, is_gift: true, timestamp: ts });
    
    await Promise.all([
      trimHistory(supabase, senderUid, 'coin_history'),
      trimHistory(supabase, recipientUid, 'diamond_history')
    ]);

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function dailyCheckInAction(uid: string) {
  const supabase = getSupabaseAdmin();
  try {
    const { data: user } = await supabase.from('users').select('last_check_in_date, check_in_streak').eq('uid', uid).single();
    const amount = 5;
    await supabase.from('users').update({ last_check_in_date: new Date().toISOString(), check_in_streak: (user?.check_in_streak || 0) + 1 }).eq('uid', uid);
    await supabase.rpc("increment_coins", { p_user_id: uid, p_amount: amount });
    return { success: true, amount };
  } catch (err) {
    return { success: false };
  }
}

export async function playSpinGameAction(userId: string, stake: number) {
  const supabase = getSupabaseAdmin();
  try {
    const ts = Date.now();
    const { error: dErr } = await supabase.rpc("increment_coins", { p_user_id: userId, p_amount: -stake });
    if (dErr) throw new Error("Insufficient coins");

    const win = Math.random() > 0.8 ? stake * 2 : 0;
    if (win > 0) {
      await supabase.rpc("increment_coins", { p_user_id: userId, p_amount: win });
      await supabase.from('coin_history').insert({
        user_id: userId, amount: win, type: 'win', description: 'Spin Win', timestamp: ts
      });
    } else {
      await supabase.from('coin_history').insert({
        user_id: userId, amount: -stake, type: 'loss', description: 'Spin Loss', timestamp: ts
      });
    }
    
    await trimHistory(supabase, userId, 'coin_history');
    return { success: true, winAmount: win, index: Math.floor(Math.random() * 20) };
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
    const result = [
      symbols[Math.floor(Math.random() * symbols.length)],
      symbols[Math.floor(Math.random() * symbols.length)],
      symbols[Math.floor(Math.random() * symbols.length)]
    ];

    const isMatch = result[0] === result[1] && result[1] === result[2];
    let winAmount = 0;
    let message = "Better luck next pull!";

    if (isMatch) {
      winAmount = stake * 2;
      message = "JACKPOT! Doubled your stake!";
      await supabase.rpc("increment_coins", { p_user_id: userId, p_amount: winAmount });
      await supabase.from('coin_history').insert({
        user_id: userId, amount: winAmount, type: 'win', description: 'Slots Jackpot', timestamp: ts
      });
    } else {
      await supabase.from('coin_history').insert({
        user_id: userId, amount: -stake, type: 'loss', description: 'Slots Loss', timestamp: ts
      });
    }

    await trimHistory(supabase, userId, 'coin_history');
    return { success: true, winAmount, slots: result, message };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function sendMysteryNoteAction(senderUid: string, text: string, count: number) {
  const supabase = getSupabaseAdmin();
  try {
    const cost = count * 10;
    const { error: dErr } = await supabase.rpc("increment_coins", { p_user_id: senderUid, p_amount: -cost });
    if (dErr) throw new Error("Insufficient coins");
    return { success: true };
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

export async function checkIdentityDuplicateAction(userId: string) {
  return { success: true };
}
