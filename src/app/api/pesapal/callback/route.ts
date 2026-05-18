import { NextResponse } from 'next/server';
import { getTransactionStatus } from '@/app/actions/payment-actions';
import { initializeFirebase } from '@/firebase';
import { ref, update, increment, push, set, get } from 'firebase/database';

/**
 * @fileOverview Webhook for PesaPal payment notifications.
 * Automatically fulfills coin orders upon successful payment verification.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  
  const orderTrackingId = searchParams.get('OrderTrackingId');
  const merchantReference = searchParams.get('OrderMerchantReference');

  if (!orderTrackingId || !merchantReference) {
    return NextResponse.json({ status: 'Invalid Request' }, { status: 400 });
  }

  try {
    const status = await getTransactionStatus(orderTrackingId);
    
    // Status Code 1 = Completed/Success
    if (status && status.status_code === 1) {
      const { database: rtdb } = initializeFirebase();
      
      // Reference format: QV_{uid}_{timestamp} or legacy MF_{uid}_{timestamp}
      const parts = merchantReference.split('_');
      const uid = parts[1];
      const amount = status.amount;

      if (!uid) throw new Error("Could not extract UID from reference");

      const processedRef = ref(rtdb, `processed_payments/${orderTrackingId}`);
      const alreadyProcessed = await get(processedRef);
      
      if (alreadyProcessed.exists()) {
        return NextResponse.json({ OrderTrackingId: orderTrackingId, status: 'Already Processed' });
      }

      let coinsToAward = 0;
      if (amount >= 1800) coinsToAward = 20000;
      else if (amount >= 1000) coinsToAward = 10000;
      else if (amount >= 550) coinsToAward = 5000;
      else if (amount >= 230) coinsToAward = 2000;
      else if (amount >= 120) coinsToAward = 1000;
      else if (amount >= 80) coinsToAward = 500;
      else if (amount >= 1) coinsToAward = 200;

      if (coinsToAward > 0) {
        const timestamp = Date.now();
        
        await update(ref(rtdb, `balances/${uid}`), {
          coins: increment(coinsToAward),
          updatedAt: timestamp
        });

        await set(push(ref(rtdb, `coin_history/${uid}`)), {
          amount: coinsToAward,
          type: 'recharge',
          description: `PesaPal: KES ${amount}`,
          timestamp
        });

        await set(processedRef, {
          uid,
          amount,
          coins: coinsToAward,
          timestamp
        });

        console.log(`[PesaPal] Fulfilled ${coinsToAward} coins for user ${uid}`);
      }
    }

    return NextResponse.json({
      OrderTrackingId: orderTrackingId,
      status: 'OK'
    });
  } catch (error: any) {
    console.error("[PesaPal IPN Error]:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
