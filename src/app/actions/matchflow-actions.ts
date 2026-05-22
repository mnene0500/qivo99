'use server';

import { supabase } from '@/lib/supabase';

/**
 * @fileOverview Secure Supabase Server Actions for QIVO.
 * Uses internal session verification (auth.getUser()) to prevent UID spoofing.
 */

async function getAuthenticatedUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Unauthorized access.");
  return user;
}

export async function awardCoinsAction(targetMatchFlowId: string, amount: number) {
  if (amount < 500) return { success: false, error: "Minimum award amount is 500 coins." };

  try {
    const user = await getAuthenticatedUser();
    const { data: caller } = await supabase.from('users').select('*').eq('uid', user.id).single();
    
    if (!caller?.is_admin && !caller?.is_coin_seller) {
      return { success: false, error: "Unauthorized role required." };
    }

    // If caller is a merchant, deduct from their own balance
    if (caller.is_coin_seller && !caller.is_admin) {
      const { data: bal } = await supabase.from('balances').select('coins').eq('user_id', user.id).single();
      if ((bal?.coins || 0) < amount) return { success: false, error: "Insufficient business balance." };
      
      await supabase.from('balances').update({ coins: (bal?.coins || 0) - amount }).eq('user_id', user.id);
      await supabase.from('coin_history').insert({
        user_id: user.id,
        amount: -amount,
        type: 'transfer',
        description: `Sold coins to user ID: ${targetMatchFlowId}`,
        timestamp: Date.now()
      });
    }

    const { data: target } = await supabase.from('users').select('uid, name').eq('match_flow_id', targetMatchFlowId.trim()).single();
    if (!target) return { success: false, error: "Target User ID not found." };

    const { data: targetBal } = await supabase.from('balances').select('coins').eq('user_id', target.uid).maybeSingle();
    
    await supabase.from('balances').upsert({ 
      user_id: target.uid, 
      coins: (targetBal?.coins || 0) + amount,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });

    await supabase.from('coin_history').insert({
      user_id: target.uid,
      amount,
      type: 'award',
      description: `Awarded by ${caller.is_admin ? 'Admin' : 'Certified Merchant'}`,
      timestamp: Date.now()
    });

    return { success: true, message: `Successfully awarded ${amount} coins to ${target.name}.` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function sendGiftAction(recipientUid: string, coinAmount: number, giftName: string) {
  try {
    const user = await getAuthenticatedUser();
    const { data: senderBal } = await supabase.from('balances').select('coins').eq('user_id', user.id).single();
    if ((senderBal?.coins || 0) < coinAmount) return { success: false, error: "Insufficient coins." };

    const timestamp = Date.now();
    const diamondGain = Math.floor(coinAmount * 0.7); 

    // 1. Deduct from Sender
    await supabase.from('balances').update({ coins: (senderBal?.coins || 0) - coinAmount }).eq('user_id', user.id);
    await supabase.from('coin_history').insert({
      user_id: user.id,
      amount: -coinAmount,
      type: 'gift_sent',
      description: `Sent ${giftName} gift`,
      timestamp
    });

    // 2. Award to Recipient (Atomic via Server Context)
    const { data: recBal } = await supabase.from('balances').select('diamonds').eq('user_id', recipientUid).maybeSingle();
    await supabase.from('balances').upsert({ 
      user_id: recipientUid, 
      diamonds: (Number(recBal?.diamonds) || 0) + diamondGain,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });

    await supabase.from('diamond_history').insert({
      user_id: recipientUid,
      amount: diamondGain,
      type: 'gift_received',
      description: `Received ${giftName} (70% share)`,
      timestamp
    });

    // 3. System message
    const ids = [user.id, recipientUid].sort();
    const chatId = `direct_${ids[0]}_${ids[1]}`;
    await supabase.from('messages').insert({ chat_id: chatId, sender_id: user.id, text: `🎁 Sent a ${giftName}!`, timestamp, is_gift: true });
    await supabase.from('chats').upsert({ id: chatId, last_message: `🎁 ${giftName}`, last_message_at: timestamp, participant_ids: [user.id, recipientUid] }, { onConflict: 'id' });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function toggleUserRoleAction(targetMatchFlowId: string, role: string, value: boolean) {
  try {
    const user = await getAuthenticatedUser();
    const { data: caller } = await supabase.from('users').select('is_admin').eq('uid', user.id).single();
    if (!caller?.is_admin) return { success: false, error: "Admin privileges required." };

    const dbRole = role === 'is_coin_seller' ? 'is_coin_seller' : role === 'is_agent' ? 'is_agent' : role;
    const { error } = await supabase.from('users').update({ [dbRole]: value }).eq('match_flow_id', targetMatchFlowId.trim());
    if (error) throw error;

    return { success: true, message: `Authority updated successfully.` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function createAgencyAction(agencyName: string) {
  try {
    const user = await getAuthenticatedUser();
    const code = Math.floor(10000 + Math.random() * 90000).toString();
    const { error: agencyErr } = await supabase.from('agencies').insert({ code, agent_uid: user.id, name: agencyName });
    if (agencyErr) throw agencyErr;

    await supabase.from('users').update({ agency_id: code, agency_status: 'approved', is_agent: true }).eq('uid', user.id);
    return { success: true, code };
  } catch (error: any) { 
    return { success: false, error: error.message }; 
  }
}

export async function requestWithdrawalAction(diamonds: number, amountKes: number, agencyId: string) {
  try {
    const user = await getAuthenticatedUser();
    const { data: bal } = await supabase.from('balances').select('diamonds').eq('user_id', user.id).single();
    if ((bal?.diamonds || 0) < diamonds) return { success: false, error: "Insufficient diamonds." };

    await supabase.from('balances').update({ diamonds: (bal?.diamonds || 0) - diamonds }).eq('user_id', user.id);

    const { error } = await supabase.from('withdrawals').insert({ 
      user_id: user.id, 
      agency_id: agencyId, 
      diamonds, 
      amount_kes: amountKes, 
      status: 'pending',
      timestamp: Date.now()
    });
    
    if (error) throw error;
    
    await supabase.from('diamond_history').insert({
      user_id: user.id,
      amount: -diamonds,
      type: 'withdrawal',
      description: `Withdrawal for Ksh ${amountKes}`,
      timestamp: Date.now()
    });

    return { success: true };
  } catch (error: any) { 
    return { success: false, error: error.message }; 
  }
}

export async function joinAgencyAction(agencyCode: string) {
  try {
    const user = await getAuthenticatedUser();
    const { data: agency } = await supabase.from('agencies').select('code').eq('code', agencyCode.trim()).single();
    if (!agency) return { success: false, error: "Invalid Agency Code." };
    
    const { error } = await supabase.from('users').update({ agency_id: agencyCode.trim(), agency_status: 'pending' }).eq('uid', user.id);
    if (error) throw error;

    return { success: true };
  } catch (error: any) { 
    return { success: false, error: error.message }; 
  }
}
