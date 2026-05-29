
'use server';

import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * @fileOverview Hardened Server Actions for QIVO.
 */

export async function completeOnboardingAction(payload: {
  uid: string; email: string; name: string; gender: string; dob: string; country: string; looking_for: string; photo_url?: string;
}) {
  const supabase = getSupabaseAdmin();
  
  try {
    const qId = Math.floor(1000000 + Math.random() * 900000000).toString();
    const timestamp = Date.now();

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

    const initialCoins = (payload.gender === 'male') ? 500 : 0;
    const initialDiamonds = (payload.gender === 'female') ? 150 : 0;

    if (initialCoins > 0) {
      await supabase.rpc("increment_coins", { p_user_id: payload.uid, p_amount: initialCoins });
    }

    if (initialDiamonds > 0) {
      await supabase.rpc("increment_diamonds", { p_user_id: payload.uid, p_amount: initialDiamonds });
    }

    return { success: true, bonus: initialCoins || initialDiamonds };
  } catch (err: any) {
    console.error("[Onboarding Error]:", err.message);
    return { success: false, error: err.message };
  }
}

export async function savePushSubscriptionAction(userId: string, endpoint: string, subscriptionJson: any) {
  const supabase = getSupabaseAdmin();
  try {
    const { error } = await supabase.from('push_subscriptions').upsert({
      user_id: userId,
      endpoint: endpoint,
      subscription_json: subscriptionJson
    }, { onConflict: 'endpoint' });
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function reportUserAction(payload: { 
  reporterId: string; 
  reportedId: string; 
  reason: string; 
  description: string; 
  proofPhotoUrl?: string; 
}) {
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

export async function resolveReportAction(adminUid: string, reportId: string, reporterUid: string) {
  const supabase = getSupabaseAdmin();
  try {
    const { data: admin } = await supabase.from('users').select('is_owner, is_special_user').eq('uid', adminUid).single();
    if (!admin?.is_owner && !admin?.is_special_user) throw new Error("Unauthorized");

    await supabase.from('reports').update({ status: 'resolved' }).eq('id', reportId);
    
    const systemMsg = "System: Your recent report has been reviewed and resolved. Thank you for keeping QIVO safe.";
    const chatId = `system_${reporterUid}`;
    await supabase.from('messages').insert({ chat_id: chatId, sender_id: adminUid, text: systemMsg, timestamp: Date.now() });

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

    const isUnlimited = owner.is_owner || owner.is_special_user;

    if (!isUnlimited) {
      const { data: bal } = await supabase.from('balances').select('coins').eq('user_id', ownerUid).single();
      if ((Number(bal?.coins) || 0) < amount) throw new Error("Insufficient merchant balance");
      await supabase.rpc("increment_coins", { p_user_id: ownerUid, p_amount: -amount });
    }

    const { error: awardErr } = await supabase.rpc("increment_coins", { p_user_id: targetUid, p_amount: amount });
    if (awardErr) throw awardErr;

    return { success: true, message: `Successfully sent ${amount} coins.` };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function toggleUserRoleAction(ownerUid: string, targetMatchFlowId: string, role: 'is_coin_seller' | 'is_agent' | 'is_owner' | 'is_special_user', value: boolean) {
  const supabase = getSupabaseAdmin();
  try {
    const { data: owner } = await supabase.from('users').select('is_owner, is_special_user').eq('uid', ownerUid).single();
    if (!owner?.is_owner && !owner?.is_special_user) throw new Error("Unauthorized");
    
    const { error: updateErr } = await supabase.from('users').update({ [role]: value }).eq('match_flow_id', targetMatchFlowId);
    if (updateErr) throw updateErr;
    return { success: true, message: "Authority updated successfully." };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function dailyCheckInAction(uid: string) {
  const supabase = getSupabaseAdmin();
  try {
    const { data: user } = await supabase.from('users').select('last_check_in_date, check_in_streak').eq('uid', uid).single();
    if (!user) throw new Error("Profile not found.");
    const now = new Date();
    if (user.last_check_in_date && new Date(user.last_check_in_date).toDateString() === now.toDateString()) {
      return { success: false, error: "Already collected." };
    }
    let streak = 1;
    if (user.last_check_in_date) {
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      if (new Date(user.last_check_in_date).toDateString() === yesterday.toDateString()) {
        streak = (user.check_in_streak || 0) + 1;
      }
    }
    const rewards = [2, 2, 5, 2, 2, 2, 10];
    const amount = rewards[(streak - 1) % 7];
    await supabase.from('users').update({ last_check_in_date: now.toISOString(), check_in_streak: streak }).eq('uid', uid);
    await supabase.rpc("increment_coins", { p_user_id: uid, p_amount: amount });
    return { success: true, amount, day: streak };
  } catch (err: any) {
    return { success: false, error: "Task failed." };
  }
}

export async function sendMessageAction(payload: { chatId: string; senderId: string; recipientId: string; text: string; }) {
  const supabase = getSupabaseAdmin();
  const timestamp = Date.now();
  try {
    const { data: sender } = await supabase.from('users').select('gender, is_owner, is_coin_seller, is_special_user, blocking, blocked_by').eq('uid', payload.senderId).single();
    const { data: recipient } = await supabase.from('users').select('is_special_user, is_coin_seller, is_owner, blocking, blocked_by').eq('uid', payload.recipientId).single();

    if (sender?.blocking?.includes(payload.recipientId) || recipient?.blocking?.includes(payload.senderId)) {
       return { success: false, error: "blocked" };
    }

    const cost = 15;
    const isFree = sender?.is_owner || sender?.is_special_user || sender?.is_coin_seller || recipient?.is_special_user || recipient?.is_coin_seller || recipient?.is_owner;

    if (sender?.gender === 'male' && !isFree) {
      const { data: bal } = await supabase.from('balances').select('coins').eq('user_id', payload.senderId).single();
      if ((Number(bal?.coins) || 0) < cost) return { success: false, error: "insufficient_funds" };
      await supabase.rpc("increment_coins", { p_user_id: payload.senderId, p_amount: -cost });
    }
    
    await supabase.from('chats').upsert({ 
      id: payload.chatId, 
      last_message: payload.text.slice(0, 100), 
      last_message_at: timestamp, 
      participant_ids: [payload.senderId, payload.recipientId],
      last_sender_id: payload.senderId 
    }, { onConflict: 'id' });

    const { error: msgError } = await supabase.from('messages').insert({ chat_id: payload.chatId, text: payload.text, sender_id: payload.senderId, timestamp });
    if (msgError) throw msgError;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: "system_error" };
  }
}

export async function requestWithdrawalAction(userUid: string, diamonds: number, amount_kes: number, agencyId: string, mpesaNumber: string) {
  const supabase = getSupabaseAdmin();
  try {
    const ts = Date.now();
    await supabase.rpc("increment_diamonds", { p_user_id: userUid, p_amount: -diamonds });
    await supabase.from('withdrawals').insert({ user_id: userUid, agency_id: agencyId, diamonds, amount_kes, mpesa_number: mpesaNumber, status: 'pending', timestamp: ts });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
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
    const { data: agency } = await supabase.from('agencies').select('code').eq('code', code).maybeSingle();
    if (!agency) throw new Error("Invalid Code.");
    await supabase.from('users').update({ agency_id: code, agency_status: 'pending' }).eq('uid', userUid);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function convertDiamondsToCoinsAction(user_id: string, diamonds: number, coins: number) {
  const supabase = getSupabaseAdmin();
  try {
    await supabase.rpc("increment_diamonds", { p_user_id: user_id, p_amount: -diamonds });
    await supabase.rpc("increment_coins", { p_user_id: user_id, p_amount: coins });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function sendGiftAction(senderUid: string, recipientUid: string, coinAmount: number, giftName: string) {
  const supabase = getSupabaseAdmin();
  try {
    const { data: senderProfile } = await supabase.from('users').select('is_owner, is_special_user').eq('uid', senderUid).single();
    const isFree = senderProfile?.is_owner || senderProfile?.is_special_user;

    if (!isFree) {
      const { data: bal } = await supabase.from('balances').select('coins').eq('user_id', senderUid).single();
      if ((Number(bal?.coins) || 0) < coinAmount) throw new Error("Insufficient coins.");
      await supabase.rpc("increment_coins", { p_user_id: senderUid, p_amount: -coinAmount });
    }

    const { data: rec } = await supabase.from('users').select('gender, name').eq('uid', recipientUid).single();
    if(!rec) throw new Error("User not found");
    const ts = Date.now();
    const reward = Math.floor(coinAmount * (rec.gender === 'female' ? 0.5 : 0.4));
    
    await supabase.rpc("increment_diamonds", { p_user_id: recipientUid, p_amount: reward });
    const chatId = `direct_${[senderUid, recipientUid].sort()[0]}_${[senderUid, recipientUid].sort()[1]}`;
    
    await Promise.all([
      supabase.from('messages').insert({ chat_id: chatId, sender_id: senderUid, text: `[Gift: ${giftName}]`, is_gift: true, timestamp: ts }),
      supabase.from('chats').upsert({ id: chatId, last_message: `[Gift: ${giftName}]`, last_message_at: ts, participant_ids: [senderUid, recipientUid], last_sender_id: senderUid })
    ]);

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function playSpinGameAction(userId: string, stake: number) {
  const supabase = getSupabaseAdmin();
  try {
    const { data: bal } = await supabase.from('balances').select('coins').eq('user_id', userId).single();
    if ((Number(bal?.coins) || 0) < stake) throw new Error("Insufficient coins.");

    let prizes: number[] = [];
    if (stake === 20) {
      prizes = [0, 5, 10, 0, 20, 0, 50, 5, 0, 10, 20, 0, 5, 0, 30, 0, 10, 50, 0, 15];
    } else if (stake === 50 || stake === 100) {
      prizes = [0, 20, 50, 0, 100, 0, 200, 20, 0, 50, 100, 0, 20, 0, 150, 0, 50, 200, 0, 80];
    } else {
      prizes = [0, 100, 200, 0, 500, 0, 1000, 100, 0, 200, 500, 0, 100, 0, 750, 0, 200, 1000, 0, 400];
    }

    const index = Math.floor(Math.random() * prizes.length);
    const winAmount = prizes[index];
    const net = winAmount - stake;

    const { error: rpcErr } = await supabase.rpc("increment_coins", { p_user_id: userId, p_amount: net });
    if (rpcErr) throw rpcErr;

    return { success: true, winAmount, index };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
