'use server';

import { getSupabaseAdmin } from '@/lib/supabase';
import webpush from 'web-push';
import { headers } from 'next/headers';

/**
 * @fileOverview Definitive Server Actions for QIVO Production.
 * Optimized atomic operations for Messaging, Economy, Gaming, and Social.
 * All sensitive operations now use the Admin Client (Service Role) to bypass RLS and triggers.
 */

// Configure Web Push with Vercel Variables
if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:support@qivo.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

async function sendPushToUser(userId: string, payload: { title: string; body: string; url: string }) {
  const supabase = getSupabaseAdmin();
  const { data: subs } = await supabase.from('push_subscriptions').select('subscription_json').eq('user_id', userId);
  
  if (!subs || subs.length === 0) return;

  const pushPromises = subs.map(sub => 
    webpush.sendNotification(sub.subscription_json as any, JSON.stringify(payload)).catch(err => {
      if (err.statusCode === 410 || err.statusCode === 404) {
        // Remove expired subscription
        return supabase.from('push_subscriptions').delete().eq('endpoint', (sub.subscription_json as any).endpoint);
      }
    })
  );

  await Promise.all(pushPromises);
}

function filterSensitiveContent(text: string): string {
  const sensitivePatterns = [
    /\d{3,}/g, // Strictly block sequences of 3+ digits (Phone numbers/Scams)
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
  
  const headerList = await headers();
  const forwarded = headerList.get('x-forwarded-for');
  const clientIp = forwarded ? forwarded.split(',')[0] : '0.0.0.0';

  try {
    // 1. SECURITY: Check IP Ban (Users on banned IPs cannot create ANY new accounts)
    const { data: ban } = await supabase.from('banned_ips').select('ip').eq('ip', clientIp).maybeSingle();
    if (ban) throw new Error("Access denied. Your network has been restricted due to policy violations.");

    // 2. SECURITY: Check Account Limit (Max 3 per IP)
    const { count: ipAccCount } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('registration_ip', clientIp);
    
    if (ipAccCount !== null && ipAccCount >= 3) {
      throw new Error("Device limit reached. You cannot create more than 3 accounts.");
    }

    // 3. ONBOARDING: Create/Update Profile
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
      registration_ip: clientIp,
      updated_at: new Date().toISOString(),
    });

    if (error) throw error;

    // 4. ECONOMY: Reward logic (Strictly ONLY for the first account ever created on this IP)
    const { data: existingReward } = await supabase
      .from('ip_rewards')
      .select('ip')
      .eq('ip', clientIp)
      .maybeSingle();

    let bonus = 0;
    if (!existingReward) {
      bonus = 300;
      // Mark IP as rewarded immediately to prevent race conditions
      await supabase.from('ip_rewards').insert({ ip: clientIp });
      
      // Award coins to the user
      await supabase.rpc("increment_coins", { p_user_id: payload.uid, p_amount: bonus });
      await supabase.from('users').update({ claimed_welcome_reward: true }).eq('uid', payload.uid);
      
      await supabase.from('coin_history').insert({
        user_id: payload.uid,
        amount: bonus,
        type: 'reward',
        description: 'Welcome Bonus',
        timestamp: Date.now()
      });
    }

    return { success: true, bonus };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function claimVerificationRewardAction(uid: string) {
  const supabase = getSupabaseAdmin();
  try {
    const { data: user } = await supabase.from('users').select('is_verified, claimed_verification_reward').eq('uid', uid).single();
    if (!user?.is_verified) throw new Error("User not verified.");
    if (user.claimed_verification_reward) throw new Error("Already claimed.");

    const amount = 50;
    await supabase.rpc("increment_coins", { p_user_id: uid, p_amount: amount });
    await supabase.from('users').update({ claimed_verification_reward: true }).eq('uid', uid);
    await supabase.from('coin_history').insert({
      user_id: uid,
      amount: amount,
      type: 'reward',
      description: 'Identity Verification Bonus',
      timestamp: Date.now()
    });
    return { success: true, amount };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function sendMessageAction(payload: { chatId: string; senderId: string; recipientId: string; text: string; imageUrl?: string; }) {
  const supabase = getSupabaseAdmin();
  const timestamp = Date.now();
  const isImage = !!payload.imageUrl;
  const safeText = filterSensitiveContent(payload.text || (isImage ? "[Photo]" : ""));

  try {
    const { data: sender } = await supabase.from('users').select('name, gender, is_admin, is_coin_seller, blocking, blocked_by').eq('uid', payload.senderId).maybeSingle();
    
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

    // Send Push Notification
    sendPushToUser(payload.recipientId, {
      title: sender?.name || "New Message",
      body: safeText,
      url: `/chats?startWith=${payload.senderId}`
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: "system_error" };
  }
}

export async function sendGiftAction(senderUid: string, recipientUid: string, coinAmount: number, giftName: string) {
  const supabase = getSupabaseAdmin();
  try {
    const ts = Date.now();
    const { data: sender } = await supabase.from('users').select('name, is_admin, is_coin_seller').eq('uid', senderUid).single();
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

    // Send Push Notification
    sendPushToUser(recipientUid, {
      title: "New Gift! 🎁",
      body: `${sender?.name || 'Someone'} sent you a ${giftName}`,
      url: `/chats?startWith=${senderUid}`
    });

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
    
    // Notify Recipient
    sendPushToUser(targetUid, {
      title: "Coins Received! 🪙",
      body: `Your wallet was credited with ${amount} coins.`,
      url: '/recharge'
    });

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
      supabase.from('profile_visits').delete().or(`visitor_id.eq.${targetUid},visited_id.eq.${targetUid}`),
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
  const finalCount = Math.min(Number(recipientCount), 10);
  const cost = finalCount * 10;
  const safeText = filterSensitiveContent(text);
  
  try {
    const { data: sender } = await supabase.from('users').select('name, gender, blocking, blocked_by').eq('uid', userId).single();
    if (!sender) throw new Error("Sender not found");

    const targetGender = sender.gender === 'male' ? 'female' : 'male';
    const blockedList = [...(sender?.blocking || []), ...(sender?.blocked_by || [])];

    const { data: balance } = await supabase.from('balances').select('coins').eq('user_id', userId).maybeSingle();
    if ((Number(balance?.coins) || 0) < cost) throw new Error("insufficient_funds");

    let query = supabase.from('users')
      .select('uid')
      .neq('uid', userId)
      .eq('gender', targetGender)
      .eq('onboarding_complete', true)
      .is('is_deleted', false);
    
    if (blockedList.length > 0) {
      query = query.not('uid', 'in', `(${blockedList.join(',')})`);
    }

    const { data: recipients } = await query.limit(finalCount);

    if (!recipients || recipients.length < finalCount) {
      return { success: false, error: "Not enough users." };
    }

    await supabase.rpc("increment_coins", { p_user_id: userId, p_amount: -cost });
    
    for (const r of recipients) {
      const chatId = `direct_${[userId, r.uid].sort()[0]}_${[userId, r.uid].sort()[1]}`;
      await supabase.from('chats').upsert({ 
        id: chatId, 
        last_message: safeText.slice(0, 100), 
        last_message_at: Date.now(), 
        participant_ids: [userId, r.uid], 
        last_sender_id: userId, 
        updated_at: new Date().toISOString() 
      });
      await supabase.from('messages').insert({ chat_id: chatId, sender_id: userId, text: safeText, timestamp: Date.now() });
      
      // Notify Recipients
      sendPushToUser(r.uid, {
        title: "Mystery Note! ✨",
        body: safeText,
        url: `/chats?startWith=${userId}`
      });
    }

    await supabase.from('coin_history').insert({
      user_id: userId,
      amount: -cost,
      type: 'blast',
      description: `Message Blast to ${finalCount} users`,
      timestamp: Date.now()
    });

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

export async function reportUserAction(payload: { reporterId: string; reportedId: string; reason: string; description: string; proofPhotoUrl?: string; }) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('reports').insert({
    reporter_id: payload.reporterId,
    reported_id: payload.reportedId,
    reason: payload.reason,
    description: payload.description,
    proof_photo_url: payload.proofPhotoUrl,
    timestamp: Date.now()
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function activateReadReceiptsAction(uid: string) {
  const supabase = getSupabaseAdmin();
  try {
    const cost = 200;
    const { data: balance } = await supabase.from('balances').select('coins').eq('user_id', uid).single();
    if ((Number(balance?.coins) || 0) < cost) return { success: false, error: "insufficient_funds" };

    const { error: deductErr } = await supabase.rpc("increment_coins", { p_user_id: uid, p_amount: -cost });
    if (deductErr) throw deductErr;

    await supabase.from('users').update({ has_read_receipts: true }).eq('uid', uid);
    await supabase.from('coin_history').insert({
      user_id: uid,
      amount: -cost,
      type: 'feature_unlock',
      description: 'Activated Read Receipts',
      timestamp: Date.now()
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function toggleUserRoleAction(adminUid: string, targetMatchFlowId: string, role: string, value: boolean) {
  const supabase = getSupabaseAdmin();
  try {
    const { data: admin } = await supabase.from('users').select('is_admin').eq('uid', adminUid).single();
    if (!admin?.is_admin) throw new Error("Unauthorized");
    
    const { error } = await supabase.from('users').update({ [role]: value }).eq('match_flow_id', targetMatchFlowId);
    if (error) throw error;
    
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function resolveReportAction(adminUid: string, reportId: string, reporterUid: string) {
  const supabase = getSupabaseAdmin();
  try {
    const { data: admin } = await supabase.from('users').select('is_admin').eq('uid', adminUid).single();
    if (!admin?.is_admin) throw new Error("Unauthorized");
    await supabase.from('reports').update({ status: 'resolved' }).eq('id', reportId);
    await supabase.rpc("increment_coins", { p_user_id: reporterUid, p_amount: 10 });
    await supabase.from('coin_history').insert({ user_id: reporterUid, amount: 10, type: 'reward', description: 'Report Bounty', timestamp: Date.now() });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function reviewRecruitmentAction(applicantUid: string, status: string) {
  const supabase = getSupabaseAdmin();
  try {
    await supabase.from('users').update({ agency_status: status }).eq('uid', applicantUid);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function updateWithdrawalStatusAction(requestId: string, status: string) {
  const supabase = getSupabaseAdmin();
  try {
    await supabase.from('withdrawals').update({ status }).eq('id', requestId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function createAgencyAction(uid: string, name: string) {
  const supabase = getSupabaseAdmin();
  try {
    const code = Math.floor(10000 + Math.random() * 90000).toString();
    await supabase.from('agencies').insert({ code, agent_uid: uid, name });
    await supabase.from('users').update({ is_agent: true, agency_id: code, agency_status: 'approved' }).eq('uid', uid);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function deleteAgencyAction(uid: string, agencyCode: string) {
  const supabase = getSupabaseAdmin();
  try {
    const { error } = await supabase.from('agencies').delete().eq('code', agencyCode).eq('agent_uid', uid);
    if (error) throw error;
    
    await supabase.from('users').update({ is_agent: false, agency_id: null, agency_status: null }).eq('uid', uid);
    
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function joinAgencyAction(uid: string, code: string) {
  const supabase = getSupabaseAdmin();
  try {
    const { data: agency } = await supabase.from('agencies').select('code').eq('code', code).maybeSingle();
    if (!agency) throw new Error("Invalid Agency Code");

    // ENFORCE 500 MEMBER LIMIT (Approved members only)
    const { count, error: countErr } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('agency_id', code)
      .eq('agency_status', 'approved');
    
    if (count !== null && count >= 500) {
      throw new Error("This agency has reached its maximum capacity of 500 members.");
    }

    await supabase.from('users').update({ agency_id: code, agency_status: 'pending' }).eq('uid', uid);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function leaveAgencyAction(uid: string) {
  const supabase = getSupabaseAdmin();
  try {
    await supabase.from('users').update({ agency_id: null, agency_status: null }).eq('uid', uid);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function convertDiamondsToCoinsAction(uid: string, diamondAmount: number, coinAmount: number) {
  const supabase = getSupabaseAdmin();
  try {
    const { error: dErr } = await supabase.rpc("increment_diamonds", { p_user_id: uid, p_amount: -diamondAmount });
    if (dErr) throw dErr;
    const { error: cErr } = await supabase.rpc("increment_coins", { p_user_id: uid, p_amount: coinAmount });
    if (cErr) throw cErr;
    await supabase.from('diamond_history').insert({ user_id: uid, amount: -diamondAmount, type: 'conversion', description: 'Exchanged for Coins', timestamp: Date.now() });
    await supabase.from('coin_history').insert({ user_id: uid, amount: coinAmount, type: 'conversion', description: 'Received from Diamond Exchange', timestamp: Date.now() });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function playSpinGameAction(uid: string, stake: number) {
  const supabase = getSupabaseAdmin();
  try {
    const { error: deductErr } = await supabase.rpc("increment_coins", { p_user_id: uid, p_amount: -stake });
    if (deductErr) throw deductErr;
    const prizes = stake <= 50 ? [0, 5, 10, 0, 20, 0, 50, 5, 0, 10, 20, 0, 5, 0, 30, 0, 10, 50, 0, 15] : [0, 100, 200, 0, 500, 0, 1000, 100, 0, 200, 500, 0, 100, 0, 750, 0, 200, 1000, 0, 400];
    const winIndex = Math.floor(Math.random() * prizes.length);
    const winAmount = prizes[winIndex];
    if (winAmount > 0) {
      await supabase.rpc("increment_coins", { p_user_id: uid, p_amount: winAmount });
      await supabase.from('coin_history').insert({ user_id: uid, amount: winAmount - stake, type: 'game', description: 'Spin to Win', timestamp: Date.now() });
    } else {
      await supabase.from('coin_history').insert({ user_id: uid, amount: -stake, type: 'game', description: 'Spin to Win (Loss)', timestamp: Date.now() });
    }
    return { success: true, index: winIndex, winAmount };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function playSlotsAction(uid: string, stake: number) {
  const supabase = getSupabaseAdmin();
  try {
    const { error: deductErr } = await supabase.rpc("increment_coins", { p_user_id: uid, p_amount: -stake });
    if (deductErr) throw deductErr;
    const symbols = ["bar", "cherry", "crown"];
    const slots = [symbols[Math.floor(Math.random() * 3)], symbols[Math.floor(Math.random() * 3)], symbols[Math.floor(Math.random() * 3)]];
    let winAmount = 0, message = "Try again!";
    if (slots[0] === slots[1] && slots[1] === slots[2]) {
      winAmount = stake * 2;
      message = `Triple ${slots[0]}! You won ${winAmount} coins!`;
      await supabase.rpc("increment_coins", { p_user_id: uid, p_amount: winAmount });
      await supabase.from('coin_history').insert({ user_id: uid, amount: winAmount - stake, type: 'game', description: 'Slot Machine Win', timestamp: Date.now() });
    } else {
      await supabase.from('coin_history').insert({ user_id: uid, amount: -stake, type: 'game', description: 'Slot Machine Loss', timestamp: Date.now() });
    }
    return { success: true, slots, winAmount, message };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function requestWithdrawalAction(uid: string, diamonds: number, amountKes: number, agencyId: string, mpesaNumber: string) {
  const supabase = getSupabaseAdmin();
  try {
    const { error: dErr } = await supabase.rpc("increment_diamonds", { p_user_id: uid, p_amount: -diamonds });
    if (dErr) throw dErr;
    
    const { error } = await supabase.from('withdrawals').insert({ 
      user_id: uid, 
      agency_id: agencyId, 
      diamonds, 
      amount_kes: amountKes, 
      mpesa_number: mpesaNumber, 
      status: 'pending', 
      timestamp: Date.now() 
    });

    if (error) throw error;

    // Prune old records: Keep only the 2 most recent for this user
    const { data: toPrune } = await supabase
      .from('withdrawals')
      .select('id')
      .eq('user_id', uid)
      .order('timestamp', { ascending: false })
      .range(2, 50);

    if (toPrune && toPrune.length > 0) {
      await supabase.from('withdrawals').delete().in('id', toPrune.map(r => r.id));
    }

    await supabase.from('diamond_history').insert({ 
      user_id: uid, 
      amount: -diamonds, 
      type: 'withdrawal', 
      description: `Payout Request: ${amountKes} KES`, 
      timestamp: Date.now() 
    });
    
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function logProfileVisitAction(visitorId: string, visitedId: string) {
  const supabase = getSupabaseAdmin();
  try {
    const { data: existing } = await supabase
      .from('profile_visits')
      .select('count')
      .eq('visitor_id', visitorId)
      .eq('visited_id', visitedId)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('profile_visits')
        .update({ 
          count: existing.count + 1, 
          last_visit_at: new Date().toISOString() 
        })
        .eq('visitor_id', visitorId)
        .eq('visited_id', visitedId);
    } else {
      await supabase
        .from('profile_visits')
        .insert({ 
          visitor_id: visitorId, 
          visited_id: visitedId, 
          count: 1, 
          last_visit_at: new Date().toISOString() 
        });
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
