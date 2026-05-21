'use server';

import { supabase } from '@/lib/supabase';

/**
 * @fileOverview Standardized Supabase Server Actions for QIVO roles and economy.
 */

export async function awardCoinsAction(callerUid: string, targetMatchFlowId: string, amount: number) {
  if (amount < 500) return { success: false, error: "Minimum award amount is 500 coins." };

  try {
    const { data: caller, error: callerErr } = await supabase.from('users').select('*').eq('uid', callerUid).single();
    if (callerErr || !caller) return { success: false, error: "Caller profile not found." };
    
    if (!caller.is_admin && !caller.is_coin_seller) {
      return { success: false, error: "Unauthorized. Role required." };
    }

    if (caller.is_coin_seller && !caller.is_admin) {
      const { data: bal } = await supabase.from('balances').select('coins').eq('user_id', callerUid).single();
      if ((bal?.coins || 0) < amount) return { success: false, error: "Insufficient balance to award." };
      await supabase.from('balances').update({ coins: (bal?.coins || 0) - amount }).eq('user_id', callerUid);
    }

    const { data: target } = await supabase.from('users').select('uid, name').eq('match_flow_id', targetMatchFlowId.trim()).single();
    if (!target) return { success: false, error: "Target User ID not found." };

    const { data: targetBal } = await supabase.from('balances').select('coins').eq('user_id', target.uid).single();
    await supabase.from('balances').update({ coins: (targetBal?.coins || 0) + amount }).eq('user_id', target.uid);

    await supabase.from('coin_history').insert({
      user_id: target.uid,
      amount,
      type: 'award',
      description: `Awarded by ${caller.is_admin ? 'Admin' : 'Certified Seller'}`,
      timestamp: Date.now()
    });

    return { success: true, message: `Successfully awarded ${amount} coins to ${target.name}.` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Sends a gift from one user to another.
 * Deducts coins from sender, adds diamonds to recipient (70% conversion).
 */
export async function sendGiftAction(senderUid: string, recipientUid: string, coinAmount: number, giftName: string) {
  try {
    // 1. Check Sender Balance
    const { data: senderBal } = await supabase.from('balances').select('coins').eq('user_id', senderUid).single();
    if ((senderBal?.coins || 0) < coinAmount) return { success: false, error: "Insufficient coins." };

    const timestamp = Date.now();
    const diamondGain = Math.floor(coinAmount * 0.7); // 70% Share for recipient

    // 2. Atomic Transactions (Simulated via sequential await for prototype)
    // Deduct from Sender
    await supabase.from('balances').update({ coins: (senderBal?.coins || 0) - coinAmount }).eq('user_id', senderUid);
    await supabase.from('coin_history').insert({
      user_id: senderUid,
      amount: -coinAmount,
      type: 'gift_sent',
      description: `Sent ${giftName} gift`,
      timestamp
    });

    // Award to Recipient
    const { data: recBal } = await supabase.from('balances').select('diamonds').eq('user_id', recipientUid).single();
    await supabase.from('balances').update({ diamonds: (Number(recBal?.diamonds) || 0) + diamondGain }).eq('user_id', recipientUid);
    await supabase.from('diamond_history').insert({
      user_id: recipientUid,
      amount: diamondGain,
      type: 'gift_received',
      description: `Received ${giftName} gift`,
      timestamp
    });

    // 3. Send a system message in the chat
    const ids = [senderUid, recipientUid].sort();
    const chatId = `direct_${ids[0]}_${ids[1]}`;
    await supabase.from('messages').insert({
      chat_id: chatId,
      sender_id: senderUid,
      text: `🎁 Sent a ${giftName}!`,
      timestamp,
      is_gift: true
    });
    
    await supabase.from('chats').upsert({
      id: chatId,
      last_message: `🎁 ${giftName}`,
      last_message_at: timestamp,
      participant_ids: [senderUid, recipientUid]
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function toggleUserRoleAction(callerUid: string, targetMatchFlowId: string, role: string, value: boolean) {
  try {
    const { data: caller } = await supabase.from('users').select('is_admin').eq('uid', callerUid).single();
    if (!caller?.is_admin) return { success: false, error: "Admin privileges required." };

    const { error } = await supabase.from('users').update({ [role]: value }).eq('match_flow_id', targetMatchFlowId.trim());
    if (error) throw error;

    return { success: true, message: `User authority updated successfully.` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function createAgencyAction(agentUid: string, agencyName: string) {
  try {
    const code = Math.floor(10000 + Math.random() * 90000).toString();
    const { error: agencyErr } = await supabase.from('agencies').insert({ code, agent_uid: agentUid, name: agencyName });
    if (agencyErr) throw agencyErr;

    await supabase.from('users').update({ agency_id: code, agency_status: 'approved', is_agent: true }).eq('uid', agentUid);
    return { success: true, code };
  } catch (error: any) { 
    return { success: false, error: error.message }; 
  }
}

export async function requestWithdrawalAction(uid: string, diamonds: number, amountKes: number, agencyId: string) {
  try {
    const { data: bal } = await supabase.from('balances').select('diamonds').eq('user_id', uid).single();
    if ((bal?.diamonds || 0) < diamonds) return { success: false, error: "Insufficient diamonds." };

    await supabase.from('balances').update({ diamonds: (bal?.diamonds || 0) - diamonds }).eq('user_id', uid);

    const { error } = await supabase.from('withdrawals').insert({ 
      user_id: uid, 
      agency_id: agencyId, 
      diamonds, 
      amount_kes: amountKes, 
      status: 'pending',
      timestamp: Date.now()
    });
    
    if (error) throw error;
    
    await supabase.from('diamond_history').insert({
      user_id: uid,
      amount: -diamonds,
      type: 'withdrawal',
      description: `Withdrawal request for Ksh ${amountKes}`,
      timestamp: Date.now()
    });

    return { success: true };
  } catch (error: any) { 
    return { success: false, error: error.message }; 
  }
}

export async function joinAgencyAction(userUid: string, agencyCode: string) {
  try {
    const { data: agency } = await supabase.from('agencies').select('code').eq('code', agencyCode.trim()).single();
    if (!agency) return { success: false, error: "Invalid Agency Code. Please check with your agent." };
    
    const { error } = await supabase.from('users').update({ agency_id: agencyCode.trim(), agency_status: 'pending' }).eq('uid', userUid);
    if (error) throw error;

    return { success: true };
  } catch (error: any) { 
    return { success: false, error: error.message }; 
  }
}

export async function reviewRecruitmentAction(agentUid: string, targetUid: string, status: 'approved' | 'rejected') {
  try {
    const { error } = await supabase.from('users').update({ agency_status: status }).eq('uid', targetUid);
    if (error) throw error;
    return { success: true };
  } catch (error: any) { 
    return { success: false, error: error.message }; 
  }
}

export async function updateWithdrawalStatusAction(agentUid: string, agencyId: string, withdrawalId: string, status: 'paid' | 'rejected') {
  try {
    const { error } = await supabase.from('withdrawals').update({ status }).eq('id', withdrawalId);
    if (error) throw error;
    return { success: true };
  } catch (error: any) { 
    return { success: false, error: error.message }; 
  }
}
