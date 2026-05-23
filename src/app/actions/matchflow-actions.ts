
'use server';

import { supabase } from '@/lib/supabase';

/**
 * @fileOverview Native Economy Actions on Vercel.
 * Purely server-side atomic transactions.
 */

export async function dailyCheckInAction(uid: string) {
  try {
    const { data: user, error: userErr } = await supabase.from('users').select('*').eq('uid', uid).maybeSingle();
    if (userErr || !user) throw new Error("Profile not found.");

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    if (user.last_check_in_date && user.last_check_in_date.split('T')[0] === today) {
      return { success: false, error: "Already collected for today." };
    }

    let streak = 1;
    if (user.last_check_in_date) {
      const last = new Date(user.last_check_in_date);
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      if (last.toISOString().split('T')[0] === yesterday.toISOString().split('T')[0]) {
        streak = (user.check_in_streak || 0) + 1;
      }
    }

    const rewards = [2, 2, 5, 2, 2, 2, 10];
    const amount = rewards[(streak - 1) % 7];
    const ts = Date.now();

    const { error: updateErr } = await supabase.from('users').update({
      last_check_in_date: now.toISOString(),
      check_in_streak: streak
    }).eq('uid', uid);

    if (updateErr) throw updateErr;

    const { error: rpcErr } = await supabase.rpc("increment_coins", { user_id: uid, amount });
    if (rpcErr) throw rpcErr;

    await supabase.from('coin_history').insert({
      user_id: uid,
      amount,
      type: 'checkin',
      description: `Daily Check-in Day ${streak}`,
      timestamp: ts
    });

    return { success: true, amount, day: streak };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function sendGiftAction(senderUid: string, recipientUid: string, coinAmount: number, giftName: string) {
  try {
    const ts = Date.now();
    const ids = [senderUid, recipientUid].sort();
    const chatId = `direct_${ids[0]}_${ids[1]}`;

    // 1. Deduct Sender
    const { error: deductErr } = await supabase.rpc("increment_coins", { user_id: senderUid, amount: -coinAmount });
    if (deductErr) throw new Error("Insufficient coins.");

    await supabase.from("coin_history").insert({
      user_id: senderUid,
      amount: -coinAmount,
      type: "gift_sent",
      description: `Sent ${giftName}`,
      timestamp: ts
    });

    // 2. Award Recipient
    const { data: rec } = await supabase.from('users').select('gender, name').eq('uid', recipientUid).single();
    const { data: sender } = await supabase.from('users').select('name').eq('uid', senderUid).single();
    
    const rate = rec?.gender === 'female' ? 0.5 : 0.4;
    const diamondReward = Math.floor(coinAmount * rate);

    await supabase.rpc("increment_diamonds", { user_id: recipientUid, amount: diamondReward });
    await supabase.from("diamond_history").insert({ 
      user_id: recipientUid, 
      amount: diamondReward, 
      type: "gift_received", 
      description: `Gift from ${sender?.name || 'User'}`, 
      timestamp: ts 
    });

    // 3. Chat Notification
    const giftMsg = `[Gift: ${giftName}]`;
    await supabase.from('messages').insert({ chat_id: chatId, sender_id: senderUid, text: giftMsg, is_gift: true, timestamp: ts });
    await supabase.from('chats').upsert({ id: chatId, last_message: giftMsg, last_message_at: ts, participant_ids: [senderUid, recipientUid] });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function awardCoinsAction(merchantUid: string, targetMatchFlowId: string, amount: number) {
  try {
    const { data: target } = await supabase.from('users').select('uid').eq('match_flow_id', targetMatchFlowId).single();
    if (!target) throw new Error("User ID not found.");
    
    const { error: rpcError } = await supabase.rpc("increment_coins", { user_id: target.uid, amount });
    if (rpcError) throw rpcError;

    await supabase.from("coin_history").insert({ 
      user_id: target.uid, 
      amount, 
      type: "merchant_award", 
      description: "Merchant Load", 
      timestamp: Date.now() 
    });
    
    return { success: true, message: `Awarded ${amount} coins.` };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function requestWithdrawalAction(userUid: string, diamonds: number, amount_kes: number, agencyId: string) {
  try {
    const ts = Date.now();
    const { error: rpcError } = await supabase.rpc("increment_diamonds", { user_id: userUid, amount: -diamonds });
    if (rpcError) throw rpcError;

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
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function createAgencyAction(creatorUid: string, agencyName: string) {
  try {
    const code = Math.floor(10000 + Math.random() * 90000).toString();
    await supabase.from('agencies').insert({ code, agent_uid: creatorUid, name: agencyName });
    await supabase.from('users').update({ is_agent: true, agency_id: code, agency_status: 'approved' }).eq('uid', creatorUid);
    return { success: true, code };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function joinAgencyAction(userUid: string, agencyCode: string) {
  try {
    await supabase.from('users').update({ agency_id: agencyCode, agency_status: 'pending' }).eq('uid', userUid);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function reviewRecruitmentAction(agentUid: string, applicantUid: string, status: 'approved' | 'rejected') {
  try {
    await supabase.from('users').update({ agency_status: status }).eq('uid', applicantUid);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function updateWithdrawalStatusAction(agentUid: string, agencyId: string, requestId: string, status: 'paid' | 'rejected') {
  try {
    await supabase.from('withdrawals').update({ status }).eq('id', requestId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function toggleUserRoleAction(callerUid: string, targetMatchFlowId: string, role: string, value: boolean) {
  try {
    const { data: admin } = await supabase.from('users').select('is_admin').eq('uid', callerUid).single();
    if (!admin?.is_admin) throw new Error("Unauthorized.");
    await supabase.from('users').update({ [role]: value }).eq('match_flow_id', targetMatchFlowId);
    return { success: true, message: "Role updated." };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function submitReportAction(reporterUid: string, reportedUid: string, reason: string, description: string, proofUrl: string) {
  try {
    await supabase.from('reports').insert({ reporter_id: reporterUid, reported_id: reportedUid, reason, description, proof_photo_url: proofUrl, timestamp: Date.now() });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function resolveReportAction(adminUid: string, reportId: string, reporterUid: string) {
  try {
    await supabase.from('reports').update({ status: 'resolved' }).eq('id', reportId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
