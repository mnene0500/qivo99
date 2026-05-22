
'use server';

import { supabase } from '@/lib/supabase';

/**
 * @fileOverview Secure Economy Actions via Supabase Edge Functions.
 * These actions invoke your Edge Functions where keys are stored.
 */

export async function dailyCheckInAction(uid: string) {
  try {
    const { data, error } = await supabase.functions.invoke('economy-ops', {
      body: { action: 'daily-check-in', uid }
    });
    if (error) throw error;
    return data;
  } catch (error: any) { 
    console.error("Check-in Error:", error.message);
    return { success: false, error: "Service busy. Try again shortly." }; 
  }
}

export async function awardCoinsAction(callerUid: string, targetMatchFlowId: string, amount: number) {
  try {
    const { data, error } = await supabase.functions.invoke('economy-ops', {
      body: { action: 'award-coins', callerUid, targetMatchFlowId, amount }
    });
    if (error) throw error;
    return data;
  } catch (error: any) { return { success: false, error: error.message }; }
}

export async function sendGiftAction(senderUid: string, recipientUid: string, coinAmount: number, giftName: string) {
  try {
    const { data, error } = await supabase.functions.invoke('economy-ops', {
      body: { action: 'send-gift', senderUid, recipientUid, coinAmount, giftName }
    });
    if (error) throw error;
    return data;
  } catch (error: any) { return { success: false, error: "Gift delivery failed." }; }
}

export async function submitReportAction(reporterUid: string, reportedUid: string, reason: string, description: string, proofUrl: string) {
  try {
    const { data, error } = await supabase.functions.invoke('economy-ops', {
      body: { action: 'submit-report', reporterUid, reportedUid, reason, description, proofUrl }
    });
    if (error) throw error;
    return data;
  } catch (error: any) { return { success: false, error: error.message }; }
}

export async function sendMysteryNoteAction(senderUid: string, message: string, recipientCount: number) {
  try {
    const { data, error } = await supabase.functions.invoke('economy-ops', {
      body: { action: 'send-mystery-note', senderUid, message, recipientCount }
    });
    if (error) throw error;
    return data;
  } catch (error: any) { return { success: false, error: error.message }; }
}

export async function toggleUserRoleAction(callerUid: string, targetMatchFlowId: string, role: string, value: boolean) {
  try {
    const { data, error } = await supabase.functions.invoke('economy-ops', {
      body: { action: 'toggle-role', callerUid, targetMatchFlowId, role, value }
    });
    if (error) throw error;
    return data;
  } catch (error: any) { return { success: false, error: error.message }; }
}

export async function createAgencyAction(creatorUid: string, agencyName: string) {
  try {
    const { data, error } = await supabase.functions.invoke('economy-ops', {
      body: { action: 'create-agency', creatorUid, agencyName }
    });
    if (error) throw error;
    return data;
  } catch (error: any) { return { success: false, error: error.message }; }
}

export async function requestWithdrawalAction(userUid: string, diamonds: number, amountKes: number, agencyId: string) {
  try {
    const { data, error } = await supabase.functions.invoke('economy-ops', {
      body: { action: 'request-withdrawal', userUid, diamonds, amountKes, agencyId }
    });
    if (error) throw error;
    return data;
  } catch (error: any) { return { success: false, error: error.message }; }
}

export async function joinAgencyAction(userUid: string, agencyCode: string) {
  try {
    const { data, error } = await supabase.functions.invoke('economy-ops', {
      body: { action: 'join-agency', userUid, agencyCode }
    });
    if (error) throw error;
    return data;
  } catch (error: any) { return { success: false, error: error.message }; }
}

export async function reviewRecruitmentAction(agentUid: string, applicantUid: string, status: 'approved' | 'rejected') {
  try {
    const { data, error } = await supabase.functions.invoke('economy-ops', {
      body: { action: 'review-recruitment', agentUid, applicantUid, status }
    });
    if (error) throw error;
    return data;
  } catch (error: any) { return { success: false, error: error.message }; }
}

export async function updateWithdrawalStatusAction(agentUid: string, agencyId: string, requestId: string, status: 'paid' | 'rejected') {
  try {
    const { data, error } = await supabase.functions.invoke('economy-ops', {
      body: { action: 'update-withdrawal-status', agentUid, agencyId, requestId, status }
    });
    if (error) throw error;
    return data;
  } catch (error: any) { return { success: false, error: error.message }; }
}
