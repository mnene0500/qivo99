'use server';

/**
 * @fileOverview Payment actions have been removed.
 */

export async function initiatePesaPalPayment() {
  return { success: false, error: "Payment system disabled." };
}

export async function verifyPaymentAction() {
  return { success: false, error: "Payment system disabled." };
}
