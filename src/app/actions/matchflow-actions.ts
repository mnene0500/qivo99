
'use server';

import { supabase } from '@/lib/supabase';

/**
 * @fileOverview Native Economy Actions.
 * These run on Vercel to ensure fast, real-time social interactions.
 * Every action now strictly logs to history tables.
 */

export async function dailyCheckInAction(uid: string) {
  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('uid', uid)
      .single();

    if (userError || !user) throw new Error("Profile not found");

    // Check if already checked in today
    if (user.last_check_in_date) {
      const lastDate = new Date(user.last_check_in_date).toDateString();
      const today = new Date().toDateString();
      if (lastDate === today) return { success: false, error: "Already claimed today." };
    }

    const streak = (user.check_in_streak || 0) + 1;
    const rewards = [2, 2, 5, 2, 2, 2, 10];
    const amount = rewards[(streak - 1) % 7];
    const ts = Date.now();

    // 1. Update User Streak
    await supabase.from('users').update({
      last_check_in_date: new Date().toISOString(),
      check_in_streak: streak
    }).eq('uid', uid);

    // 2. Add Coins
    await supabase.rpc("increment_coins", { user_uid: uid, amount });

    // 3. Log History
    await supabase.from('coin_history').insert({
      user_id: uid,
      amount: amount,
      type: 'checkin',
      description: `Daily Check-in Day ${streak}`,
      timestamp: ts
    });

    return { success: true, amount, day: streak };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function sendGiftAction(senderUid: string, recipientUid: string, coinAmount: number, giftName: string) {
  try {
    const ts = Date.now();
    const ids = [senderUid, recipientUid].sort();
    const chatId = `direct_${ids[0]}_${ids[1]}`;

    // 1. Deduct Sender
    await supabase.rpc("increment_coins", { user_uid: senderUid, amount: -coinAmount });
    await supabase.from("coin_history").insert({
      user_id: senderUid,
      amount: -coinAmount,
      type: "gift_sent",
      description: `Sent ${giftName}`,
      timestamp: ts
    });

    // 2. Fetch Recipient Rates
    const { data: rec } = await supabase.from('users').select('gender, name').eq('uid', recipientUid).single();
    const { data: sender } = await supabase.from('users').select('name').eq('uid', senderUid).single();
    
    const rate = rec?.gender === 'female' ? 0.5 : 0.4;
    const diamondReward = coinAmount * rate;

    // 3. Award Recipient
    await supabase.rpc("increment_diamonds", { user_id: recipientUid, amount: diamondReward });
    await supabase.from("diamond_history").insert({ 
      user_id: recipientUid, 
      amount: diamondReward, 
      type: "gift_received", 
      description: `Gift from ${sender?.name || 'User'}`, 
      timestamp: ts 
    });

    // 4. Insert into Chat
    const giftMsg = `[Gift: ${giftName}]`;
    await supabase.from('messages').insert({ chat_id: chatId, sender_id: senderUid, text: giftMsg, is_gift: true, timestamp: ts });
    await supabase.from('chats').upsert({ id: chatId, last_message: giftMsg, last_message_at: ts, participant_ids: [senderUid, recipientUid] });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function awardCoinsAction(callerUid: string, targetMatchFlowId: string, amount: number) {
  try {
    const { data: target } = await supabase.from('users').select('uid, name').eq('match_flow_id', targetMatchFlowId).single();
    if (!target) throw new Error("User ID not found.");

    await supabase.rpc("increment_coins", { user_uid: target.uid, amount });
    await supabase.from("coin_history").insert({
      user_id: target.uid,
      amount: amount,
      type: "transfer",
      description: "Merchant Award",
      timestamp: Date.now()
    });

    return { success: true, message: `Awarded ${amount} coins to ${target.name}.` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function convertDiamondsToCoinsAction(uid: string, diamonds: number, coins: number) {
  try {
    const ts = Date.now();
    // 1. Deduct Diamonds
    await supabase.rpc("increment_diamonds", { user_id: uid, amount: -diamonds });
    await supabase.from("diamond_history").insert({
      user_id: uid,
      amount: -diamonds,
      type: "conversion",
      description: `Converted to ${coins} coins`,
      timestamp: ts
    });

    // 2. Add Coins
    await supabase.rpc("increment_coins", { user_uid: uid, amount: coins });
    await supabase.from("coin_history").insert({
      user_id: uid,
      amount: coins,
      type: "conversion",
      description: `Diamond Conversion`,
      timestamp: ts
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function requestWithdrawalAction(userUid: string, diamonds: number, amount_kes: number, agencyId: string) {
  try {
    const ts = Date.now();
    // 1. Deduct Balance Immediately
    await supabase.rpc("increment_diamonds", { user_id: userUid, amount: -diamonds });
    
    // 2. Log History
    await supabase.from('diamond_history').insert({
      user_id: userUid,
      amount: -diamonds,
      type: 'withdrawal',
      description: `Payout Request KES ${amount_kes}`,
      timestamp: ts
    });

    // 3. Create Record
    const { error } = await supabase.from('withdrawals').insert({
      user_id: userUid,
      agency_id: agencyId,
      diamonds,
      amount_kes,
      status: 'pending',
      timestamp: ts
    });
    if (error) throw error;

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function sendMysteryNoteAction(senderUid: string, message: string, recipientCount: number) {
  try {
    const cost = recipientCount * 10;
    const { data: bal } = await supabase.from('balances').select('coins').eq('user_id', senderUid).single();
    if ((bal?.coins || 0) < cost) throw new Error("Insufficient coins");

    await supabase.rpc("increment_coins", { user_uid: senderUid, amount: -cost });
    await supabase.from('coin_history').insert({
      user_id: senderUid,
      amount: -cost,
      type: 'mystery_note',
      description: `Sent Mystery Note to ${recipientCount} people`,
      timestamp: Date.now()
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function submitReportAction(reporterUid: string, reportedUid: string, reason: string, description: string, proofUrl: string) {
  try {
    const { error } = await supabase.from('reports').insert({
      reporter_id: reporterUid,
      reported_id: reportedUid,
      reason,
      description,
      proof_photo_url: proofUrl,
      timestamp: Date.now()
    });
    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function resolveReportAction(adminUid: string, reportId: string, reporterUid: string) {
  try {
    await supabase.from('reports').update({ status: 'resolved' }).eq('id', reportId);
    
    // Notify reporter via chat
    const ids = [adminUid, reporterUid].sort();
    const chatId = `direct_${ids[0]}_${ids[1]}`;
    const msg = "The QIVO team is resolving your complaint. Thank you for your patience.";
    const ts = Date.now();
    
    await supabase.from('messages').insert({ chat_id: chatId, sender_id: adminUid, text: msg, timestamp: ts });
    await supabase.from('chats').upsert({ id: chatId, last_message: msg, last_message_at: ts, participant_ids: [adminUid, reporterUid] });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function createAgencyAction(creatorUid: string, agencyName: string) {
  try {
    const code = Math.floor(10000 + Math.random() * 90000).toString();
    const { error } = await supabase.from('agencies').insert({ code, agent_uid: creatorUid, name: agencyName });
    if (error) throw error;
    await supabase.from('users').update({ is_agent: true, agency_id: code, agency_status: 'approved' }).eq('uid', creatorUid);
    return { success: true, code };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function toggleUserRoleAction(callerUid: string, targetMatchFlowId: string, role: string, value: boolean) {
  try {
    const { data: admin } = await supabase.from('users').select('is_admin').eq('uid', callerUid).single();
    if (!admin?.is_admin) throw new Error("Unauthorized");

    const { error } = await supabase.from('users').update({ [role]: value }).eq('match_flow_id', targetMatchFlowId);
    if (error) throw error;
    return { success: true, message: "Authority updated." };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function joinAgencyAction(userUid: string, agencyCode: string) {
  try {
    const { error } = await supabase.from('users').update({ agency_id: agencyCode, agency_status: 'pending' }).eq('uid', userUid);
    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function reviewRecruitmentAction(agentUid: string, applicantUid: string, status: 'approved' | 'rejected') {
  try {
    const { error } = await supabase.from('users').update({ agency_status: status }).eq('uid', applicantUid);
    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateWithdrawalStatusAction(agentUid: string, agencyId: string, requestId: string, status: 'paid' | 'rejected') {
  try {
    const { error } = await supabase.from('withdrawals').update({ status }).eq('id', requestId);
    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
