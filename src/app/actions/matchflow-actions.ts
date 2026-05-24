'use server';

import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * @fileOverview Native Economy Actions on Vercel.
 * Purely server-side atomic transactions using private secrets.
 */

export async function dailyCheckInAction(uid: string) {
  const supabase = getSupabaseAdmin();
  try {
    const { data: user, error: userErr } = await supabase.from('users').select('*').eq('uid', uid).maybeSingle();
    if (userErr || !user) throw new Error("Profile not found.");

    const now = new Date();
    const todayStr = now.toDateString();
    
    if (user.last_check_in_date) {
      const lastCheckIn = new Date(user.last_check_in_date);
      if (lastCheckIn.toDateString() === todayStr) {
        return { success: false, error: "Already collected for today." };
      }
    }

    let streak = 1;
    if (user.last_check_in_date) {
      const last = new Date(user.last_check_in_date);
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      if (last.toDateString() === yesterday.toDateString()) {
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
    console.error("[Checkin Error]:", err.message);
    return { success: false, error: "Network Error: Please check your connection." };
  }
}

export async function awardCoinsAction(merchantUid: string, targetMatchFlowId: string, amount: number) {
  const supabase = getSupabaseAdmin();
  try {
    // 1. Verify Caller Authority strictly via Table Query using Admin Client (Bypasses RLS)
    const { data: merchant, error: authErr } = await supabase
      .from('users')
      .select('uid, email, is_admin, is_coin_seller, name')
      .eq('uid', merchantUid)
      .maybeSingle();

    if (authErr) throw new Error(`Authorization lookup failed: ${authErr.message}`);
    if (!merchant) throw new Error("Merchant profile not found.");

    const canTransfer = merchant.is_admin || merchant.is_coin_seller;
    if (!canTransfer) throw new Error("Unauthorized to award coins.");

    // 2. Resolve Target User by Numeric ID (MatchFlow ID)
    const cleanedId = targetMatchFlowId.trim();
    const { data: target, error: targetErr } = await supabase
      .from('users')
      .select('uid, name')
      .eq('match_flow_id', cleanedId)
      .maybeSingle();
    
    if (targetErr || !target) throw new Error(`Recipient Numeric ID (${cleanedId}) not found.`);

    const ts = Date.now();

    // 3. Admin (Unlimited) vs Merchant (Deduction) logic
    if (!merchant.is_admin && merchant.is_coin_seller) {
      const { data: bal } = await supabase.from('balances').select('coins').eq('user_id', merchantUid).single();
      const currentBal = Number(bal?.coins) || 0;
      if (currentBal < amount) throw new Error(`Insufficient coins. Your balance: ${currentBal}`);

      // Deduct Merchant
      const { error: deductErr } = await supabase.rpc("increment_coins", { user_id: merchantUid, amount: -amount });
      if (deductErr) throw new Error("Failed to deduct from your wallet.");

      await supabase.from("coin_history").insert({
        user_id: merchantUid,
        amount: -amount,
        type: "merchant_sale",
        description: `Transferred to ${target.name}`,
        timestamp: ts
      });
    }

    // 4. Atomic Award to Recipient
    const { error: awardErr } = await supabase.rpc("increment_coins", { user_id: target.uid, amount });
    if (awardErr) throw new Error("Failed to credit coins to the recipient.");

    await supabase.from("coin_history").insert({
      user_id: target.uid,
      amount,
      type: "merchant_award",
      description: merchant.is_admin ? "System Award (Admin)" : `Purchased from ${merchant.name}`,
      timestamp: ts
    });

    return { success: true, message: `Successfully sent ${amount} coins to ${target.name}.` };
  } catch (err: any) {
    console.error("[Award Logic Error]:", err.message);
    return { success: false, error: err.message };
  }
}

export async function clearChatAction(uid: string, chatId: string) {
  const supabase = getSupabaseAdmin();
  try {
    const { data: chat } = await supabase.from('chats').select('cleared_at').eq('id', chatId).single();
    const newClearedAt = { ...(chat?.cleared_at || {}), [uid]: Date.now() };
    await supabase.from('chats').update({ cleared_at: newClearedAt }).eq('id', chatId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function toggleUserRoleAction(callerUid: string, targetMatchFlowId: string, role: string, value: boolean) {
  const supabase = getSupabaseAdmin();
  try {
    // 1. Verify Caller Authority
    const { data: admin, error: authErr } = await supabase
      .from('users')
      .select('is_admin')
      .eq('uid', callerUid)
      .maybeSingle();

    if (authErr || !admin?.is_admin) throw new Error("Unauthorized: Admin access required.");
    
    const validRoles = ['is_coin_seller', 'is_agent', 'is_verified', 'is_admin'];
    if (!validRoles.includes(role)) throw new Error("Invalid authority role.");

    // 2. Perform Update by MatchFlow ID
    const { error } = await supabase
      .from('users')
      .update({ [role]: value })
      .eq('match_flow_id', targetMatchFlowId.trim());
    
    if (error) throw error;
    
    return { success: true, message: "User authority updated." };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function submitReportAction(reporterUid: string, reportedUid: string, reason: string, description: string, proofUrl: string) {
  const supabase = getSupabaseAdmin();
  try {
    await supabase.from('reports').insert({ reporter_id: reporterUid, reported_id: reportedUid, reason, description, proof_photo_url: proofUrl, timestamp: Date.now() });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function resolveReportAction(adminUid: string, reportId: string, reporterUid: string) {
  const supabase = getSupabaseAdmin();
  try {
    const { data: admin, error: authErr } = await supabase
      .from('users')
      .select('is_admin')
      .eq('uid', adminUid)
      .single();

    if (authErr || !admin?.is_admin) throw new Error("Unauthorized.");

    await supabase.from('reports').update({ status: 'resolved' }).eq('id', reportId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function convertDiamondsToCoinsAction(user_id: string, diamonds: number, coins: number) {
  const supabase = getSupabaseAdmin();
  try {
    const ts = Date.now();
    const { error: deductErr } = await supabase.rpc("increment_diamonds", { user_id, amount: -diamonds });
    if (deductErr) throw new Error("Insufficient diamonds for conversion.");
    const { error: awardErr } = await supabase.rpc("increment_coins", { user_id, amount: coins });
    if (awardErr) throw new Error("Failed to credit coins.");

    await Promise.all([
      supabase.from('diamond_history').insert({ user_id, amount: -diamonds, type: 'conversion', description: `Exchanged for ${coins} coins`, timestamp: ts }),
      supabase.from('coin_history').insert({ user_id, amount: coins, type: 'conversion', description: `Exchanged from ${diamonds} diamonds`, timestamp: ts })
    ]);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function sendMysteryNoteAction(user_id: string, message: string, recipientCount: number) {
  const supabase = getSupabaseAdmin();
  try {
    const cost = Number(recipientCount) * 10;
    const ts = Date.now();
    
    const { data: balance } = await supabase.from('balances').select('coins').eq('user_id', user_id).single();
    if ((Number(balance?.coins) || 0) < cost) {
      throw new Error("Insufficient coins for this operation.");
    }

    const { error: deductErr } = await supabase.rpc("increment_coins", { user_id: user_id, amount: -cost });
    if (deductErr) throw new Error("Payment deduction failed.");

    await supabase.from('coin_history').insert({ 
      user_id, 
      amount: -cost, 
      type: 'mystery_note', 
      description: `Note to ${recipientCount} people`, 
      timestamp: ts 
    });
    
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function sendGiftAction(senderUid: string, recipientUid: string, coinAmount: number, giftName: string) {
  const supabase = getSupabaseAdmin();
  try {
    const ts = Date.now();
    const ids = [senderUid, recipientUid].sort();
    const chatId = `direct_${ids[0]}_${ids[1]}`;
    
    const { data: bal } = await supabase.from('balances').select('coins').eq('user_id', senderUid).single();
    if ((Number(bal?.coins) || 0) < coinAmount) throw new Error("Insufficient coins.");

    const { error: deductErr } = await supabase.rpc("increment_coins", { user_id: senderUid, amount: -coinAmount });
    if (deductErr) throw deductErr;

    const { data: rec } = await supabase.from('users').select('gender, name').eq('uid', recipientUid).single();
    const { data: sender } = await supabase.from('users').select('name').eq('uid', senderUid).single();
    
    const rate = rec?.gender === 'female' ? 0.5 : 0.4;
    const reward = Math.floor(coinAmount * rate);

    await supabase.rpc("increment_diamonds", { user_id: recipientUid, amount: reward });
    
    await Promise.all([
      supabase.from("coin_history").insert({ user_id: senderUid, amount: -coinAmount, type: "gift_sent", description: `Sent ${giftName}`, timestamp: ts }),
      supabase.from("diamond_history").insert({ user_id: recipientUid, amount: reward, type: "gift_received", description: `Gift from ${sender?.name || 'User'}`, timestamp: ts }),
      supabase.from('messages').insert({ chat_id: chatId, sender_id: senderUid, text: `[Gift: ${giftName}]`, is_gift: true, timestamp: ts }),
      supabase.from('chats').upsert({ id: chatId, last_message: `[Gift: ${giftName}]`, last_message_at: ts, participant_ids: [senderUid, recipientUid] })
    ]);
    
    return { success: true };
  } catch (err: any) {
    console.error("[Gift Error]:", err.message);
    return { success: false, error: err.message };
  }
}

export async function requestWithdrawalAction(userUid: string, diamonds: number, amount_kes: number, agencyId: string) {
  const supabase = getSupabaseAdmin();
  try {
    const ts = Date.now();
    const { error: rpcError } = await supabase.rpc("increment_diamonds", { user_id: userUid, amount: -diamonds });
    if (rpcError) throw rpcError;
    await Promise.all([
      supabase.from('withdrawals').insert({ user_id: userUid, agency_id: agencyId, diamonds, amount_kes, status: 'pending', timestamp: ts }),
      supabase.from('diamond_history').insert({ user_id: userUid, amount: -diamonds, type: 'withdrawal', description: `Payout Request KES ${amount_kes}`, timestamp: ts })
    ]);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function createAgencyAction(creatorUid: string, agencyName: string) {
  const supabase = getSupabaseAdmin();
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
  const supabase = getSupabaseAdmin();
  try {
    await supabase.from('users').update({ agency_id: agencyCode, agency_status: 'pending' }).eq('uid', userUid);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function reviewRecruitmentAction(agentUid: string, applicantUid: string, status: 'approved' | 'rejected') {
  const supabase = getSupabaseAdmin();
  try {
    await supabase.from('users').update({ agency_status: status }).eq('uid', applicantUid);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function updateWithdrawalStatusAction(agentUid: string, agencyId: string, requestId: string, status: 'paid' | 'rejected') {
  const supabase = getSupabaseAdmin();
  try {
    await supabase.from('withdrawals').update({ status }).eq('id', requestId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
