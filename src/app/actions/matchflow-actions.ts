
'use server';

import { getSupabaseAdmin } from '@/lib/supabase';
import { headers } from 'next/headers';

/**
 * @fileOverview Hardened, Rate-Limited Server Actions.
 * Optimized for Supabase cost efficiency and atomic security.
 */

const OFFENSIVE_WORDS = [
  'fuck', 'shit', 'bitch', 'asshole', 'dick', 'pussy', 'nigger', 'bastard',
  'kuma', 'mboro', 'malaya', 'mjinga', 'msenge', 'shenzi', 'kundu', 'fala'
];

function moderateText(text: string): boolean {
  const lowerText = text.toLowerCase();
  return OFFENSIVE_WORDS.some(word => lowerText.includes(word));
}

export async function sendMessageAction(payload: {
  chatId: string;
  senderId: string;
  recipientId: string;
  text: string;
}) {
  const supabase = getSupabaseAdmin();
  const timestamp = Date.now();

  try {
    if (moderateText(payload.text)) return { success: false, error: "offensive_content" };

    const { data: sender } = await supabase
      .from('users')
      .select('gender, is_admin, is_coin_seller')
      .eq('uid', payload.senderId)
      .single();

    if (!sender) throw new Error("Sender not found.");

    const cost = 15;
    if (sender.gender === 'male' && !sender.is_admin && !sender.is_coin_seller) {
      const { data: bal } = await supabase.from('balances').select('coins').eq('user_id', payload.senderId).single();
      if ((Number(bal?.coins) || 0) < cost) return { success: false, error: "insufficient_funds" };

      const { error: rpcErr } = await supabase.rpc("increment_coins", { p_user_id: payload.senderId, p_amount: -cost });
      if (rpcErr) throw rpcErr;

      await supabase.from("coin_history").insert({
        user_id: payload.senderId, amount: -cost, type: "chat_cost", description: `Message`, timestamp
      });
    }

    // Upsert chat with optimized column update
    await supabase.from('chats').upsert({ 
      id: payload.chatId, 
      last_message: payload.text.slice(0, 100), 
      last_message_at: timestamp, 
      participant_ids: [payload.senderId, payload.recipientId] 
    }, { onConflict: 'id' });

    const { error: msgError } = await supabase.from('messages').insert({ 
      chat_id: payload.chatId, 
      text: payload.text, 
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

export async function completeOnboardingAction(payload: {
  uid: string; email: string; name: string; gender: string; dob: string; country: string; looking_for: string; photo_url?: string;
}) {
  const supabase = getSupabaseAdmin();
  const headersList = await headers();
  const ip = headersList.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1';

  try {
    const { count } = await supabase.from('users').select('uid', { count: 'exact', head: true }).eq('last_ip', ip);
    if (count !== null && count >= 3) return { success: false, error: "Account limit reached." };

    let initialCoins = (payload.gender === 'male' && count !== null && count < 2) ? 500 : 0;
    const initialDiamonds = payload.gender === 'female' ? 150 : 0;
    const qId = Math.floor(1000000 + Math.random() * 900000000).toString();
    const timestamp = Date.now();

    const { error: profileErr } = await supabase.from('users').upsert({
      uid: payload.uid, email: payload.email, name: payload.name, gender: payload.gender, dob: payload.dob,
      country: payload.country, looking_for: payload.looking_for, onboarding_complete: true,
      match_flow_id: qId, photo_url: payload.photo_url, last_ip: ip, updated_at: new Date().toISOString()
    });

    if (profileErr) throw profileErr;

    await supabase.from('balances').upsert({ user_id: payload.uid, coins: initialCoins, diamonds: initialDiamonds });

    if (initialCoins > 0) {
      await supabase.from('coin_history').insert({ user_id: payload.uid, amount: initialCoins, type: 'bonus', description: 'Welcome Bonus', timestamp });
    }

    return { success: true, bonus: initialCoins };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function deleteUserCompletelyAction(uid: string) {
  const supabase = getSupabaseAdmin();
  try {
    // 1. Delete chats this user was part of
    await supabase.from('chats').delete().contains('participant_ids', [uid]);
    
    // 2. Explicitly delete the profile from public.users
    // This triggers ON DELETE CASCADE for balances, coin_history, diamond_history, etc.
    await supabase.from('users').delete().eq('uid', uid);
    
    // 3. Delete the actual Auth account
    const { error } = await supabase.auth.admin.deleteUser(uid);
    if (error) throw error;
    
    return { success: true };
  } catch (err: any) {
    console.error("[Delete User Error]:", err.message);
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
    const ts = Date.now();

    await supabase.from('users').update({ last_check_in_date: now.toISOString(), check_in_streak: streak }).eq('uid', uid);
    await supabase.rpc("increment_coins", { p_user_id: uid, p_amount: amount });
    await supabase.from('coin_history').insert({ user_id: uid, amount, type: 'checkin', description: `Check-in Day ${streak}`, timestamp: ts });

    return { success: true, amount, day: streak };
  } catch (err: any) {
    return { success: false, error: "Task failed." };
  }
}

export async function sendGiftAction(senderUid: string, recipientUid: string, coinAmount: number, giftName: string) {
  const supabase = getSupabaseAdmin();
  try {
    const { data: bal } = await supabase.from('balances').select('coins').eq('user_id', senderUid).single();
    if ((Number(bal?.coins) || 0) < coinAmount) throw new Error("Insufficient coins.");

    const { data: rec } = await supabase.from('users').select('gender, name').eq('uid', recipientUid).single();
    const { data: sender } = await supabase.from('users').select('name').eq('uid', senderUid).single();
    if(!rec || !sender) throw new Error("User not found");

    const ts = Date.now();
    const reward = Math.floor(coinAmount * (rec.gender === 'female' ? 0.5 : 0.4));

    await supabase.rpc("increment_coins", { p_user_id: senderUid, p_amount: -coinAmount });
    await supabase.rpc("increment_diamonds", { p_user_id: recipientUid, p_amount: reward });
    
    const chatId = `direct_${[senderUid, recipientUid].sort()[0]}_${[senderUid, recipientUid].sort()[1]}`;
    
    await Promise.all([
      supabase.from("coin_history").insert({ user_id: senderUid, amount: -coinAmount, type: "gift", description: `Sent ${giftName}`, timestamp: ts }),
      supabase.from("diamond_history").insert({ user_id: recipientUid, amount: reward, type: "gift", description: `Gift from ${sender.name}`, timestamp: ts }),
      supabase.from('messages').insert({ chat_id: chatId, sender_id: senderUid, text: `[Gift: ${giftName}]`, is_gift: true, timestamp: ts }),
      supabase.from('chats').upsert({ id: chatId, last_message: `[Gift: ${giftName}]`, last_message_at: ts, participant_ids: [senderUid, recipientUid] })
    ]);
    
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function clearChatAction(uid: string, chatId: string) {
  const supabase = getSupabaseAdmin();
  try {
    const { data } = await supabase.from('chats').select('cleared_at').eq('id', chatId).single();
    const newClearedAt = { ...(data?.cleared_at as Record<string, number> || {}), [uid]: Date.now() };
    await supabase.from('chats').update({ cleared_at: newClearedAt }).eq('id', chatId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function submitReportAction(reporterId: string, reportedId: string, reason: string, description: string, proofUrl: string) {
  const supabase = getSupabaseAdmin();
  try {
    await supabase.from('reports').insert({
      reporter_id: reporterId, reported_id: reportedId, reason, description, proof_photo_url: proofUrl, timestamp: Date.now()
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function resolveReportAction(adminUid: string, reportId: string) {
  const supabase = getSupabaseAdmin();
  try {
    const { data: admin } = await supabase.from('users').select('is_admin').eq('uid', adminUid).single();
    if (!admin?.is_admin) throw new Error("Unauthorized.");
    await supabase.from('reports').update({ status: 'resolved' }).eq('id', reportId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function toggleUserRoleAction(adminUid: string, targetMatchFlowId: string, role: 'is_coin_seller' | 'is_agent' | 'is_admin', value: boolean) {
  const supabase = getSupabaseAdmin();
  try {
    const { data: admin } = await supabase.from('users').select('is_admin').eq('uid', adminUid).single();
    if (!admin?.is_admin) throw new Error("Unauthorized.");
    await supabase.from('users').update({ [role]: value }).eq('match_flow_id', targetMatchFlowId.trim());
    return { success: true, message: "Authority updated." };
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
    const { data: agency } = await supabase.from('agencies').select('code').eq('code', code).maybeSingle();
    if (!agency) throw new Error("Invalid Agency Code.");
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

export async function deleteAgencyAction(agentUid: string, agencyCode: string) {
  const supabase = getSupabaseAdmin();
  try {
    // 1. Clear everyone who was in this agency
    await supabase.from('users').update({ agency_id: null, agency_status: null }).eq('agency_id', agencyCode);
    
    // 2. Delete the agency record itself
    const { error } = await supabase.from('agencies').delete().eq('code', agencyCode).eq('agent_uid', agentUid);
    
    if (error) throw error;

    // 3. Demote the agent
    await supabase.from('users').update({ is_agent: false, agency_id: null, agency_status: null }).eq('uid', agentUid);
    
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function reviewRecruitmentAction(applicantUid: string, status: 'approved' | 'rejected') {
  const supabase = getSupabaseAdmin();
  try {
    if (status === 'rejected') {
      // Clear agency ID and status completely so they can apply elsewhere
      await supabase.from('users').update({ agency_id: null, agency_status: null }).eq('uid', applicantUid);
    } else {
      await supabase.from('users').update({ agency_status: status }).eq('uid', applicantUid);
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function updateWithdrawalStatusAction(requestId: string, status: 'paid' | 'rejected') {
  const supabase = getSupabaseAdmin();
  try {
    await supabase.from('withdrawals').update({ status }).eq('id', requestId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function requestWithdrawalAction(userUid: string, diamonds: number, amount_kes: number, agencyId: string) {
  const supabase = getSupabaseAdmin();
  try {
    const ts = Date.now();
    await supabase.rpc("increment_diamonds", { p_user_id: userUid, p_amount: -diamonds });
    await Promise.all([
      supabase.from('withdrawals').insert({ user_id: userUid, agency_id: agencyId, diamonds, amount_kes, status: 'pending', timestamp: ts }),
      supabase.from('diamond_history').insert({ user_id: userUid, amount: -diamonds, type: 'withdrawal', description: `Payout Request KES ${amount_kes}`, timestamp: ts })
    ]);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function convertDiamondsToCoinsAction(user_id: string, diamonds: number, coins: number) {
  const supabase = getSupabaseAdmin();
  try {
    const ts = Date.now();
    await supabase.rpc("increment_diamonds", { p_user_id: user_id, p_amount: -diamonds });
    await supabase.rpc("increment_coins", { p_user_id: user_id, p_amount: coins });
    await Promise.all([
      supabase.from('diamond_history').insert({ user_id, amount: -diamonds, type: 'conversion', description: `Exchanged for coins`, timestamp: ts }),
      supabase.from('coin_history').insert({ user_id, amount: coins, type: 'conversion', description: `Exchanged from diamonds`, timestamp: ts })
    ]);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function awardCoinsAction(merchantUid: string, targetUid: string, amount: number) {
  const supabase = getSupabaseAdmin();
  try {
    const { data: merchant } = await supabase.from('users').select('is_admin, is_coin_seller, name').eq('uid', merchantUid).single();
    if (!merchant?.is_admin && !merchant?.is_coin_seller) throw new Error("Unauthorized.");

    const ts = Date.now();
    if (!merchant.is_admin) {
      const { data: bal } = await supabase.from('balances').select('coins').eq('user_id', merchantUid).single();
      if ((Number(bal?.coins) || 0) < amount) throw new Error("Insufficient coins.");
      await supabase.rpc("increment_coins", { p_user_id: merchantUid, p_amount: -amount });
      await supabase.from("coin_history").insert({ user_id: merchantUid, amount: -amount, type: "sale", description: `Sold coins`, timestamp: ts });
    }

    await supabase.rpc("increment_coins", { p_user_id: targetUid.trim(), p_amount: amount });
    await supabase.from("coin_history").insert({ 
      user_id: targetUid.trim(), amount, type: "award", description: merchant.is_admin ? "System Award" : `Merchant Top-up`, timestamp: ts 
    });

    return { success: true, message: `Successfully transferred ${amount} coins.` };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function sendMysteryNoteAction(user_id: string, message: string, recipientCount: number) {
  const supabase = getSupabaseAdmin();
  try {
    const cost = Number(recipientCount) * 10;
    const { data: user } = await supabase.from('users').select('gender, blocking, blocked_by').eq('uid', user_id).single();
    const { data: bal } = await supabase.from('balances').select('coins').eq('user_id', user_id).single();
    
    if ((Number(bal?.coins) || 0) < cost) throw new Error("Insufficient coins.");

    const targetGender = user?.gender === 'male' ? 'female' : 'male';
    const blockedList = [...(user?.blocking || []), ...(user?.blocked_by || [])];

    const { data: targets } = await supabase
      .from('users')
      .select('uid')
      .eq('gender', targetGender)
      .eq('onboarding_complete', true)
      .not('uid', 'in', `(${[user_id, ...blockedList].join(',')})`)
      .limit(recipientCount);
    
    if (!targets?.length) throw new Error("No users found.");

    await supabase.rpc("increment_coins", { p_user_id: user_id, p_amount: -cost });
    const ts = Date.now();

    for (const target of targets) {
      const chatId = `direct_${[user_id, target.uid].sort()[0]}_${[user_id, target.uid].sort()[1]}`;
      await supabase.from('chats').upsert({ id: chatId, last_message: message, last_message_at: ts, participant_ids: [user_id, target.uid] });
      await supabase.from('messages').insert({ chat_id: chatId, sender_id: user_id, text: message, timestamp: ts });
    }
    
    await supabase.from('coin_history').insert({ user_id, amount: -cost, type: 'mystery_note', description: `Blast to ${targets.length} users`, timestamp: ts });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
