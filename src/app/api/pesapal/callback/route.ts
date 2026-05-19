import { NextResponse } from 'next/server';
import { fulfillPaymentAction } from '@/app/actions/payment-actions';

/**
 * @fileOverview Webhook for PesaPal payment notifications.
 * Automatically fulfills coin orders upon successful payment verification in Realtime.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  
  const orderTrackingId = searchParams.get('OrderTrackingId') || searchParams.get('orderTrackingId');
  const merchantReference = searchParams.get('OrderMerchantReference') || searchParams.get('orderMerchantReference');

  console.log(`[PesaPal IPN] Received notification. Tracking ID: ${orderTrackingId}, Reference: ${merchantReference}`);

  if (!orderTrackingId || !merchantReference) {
    return NextResponse.json({ status: 'Invalid Request', message: 'Missing parameters' }, { status: 400 });
  }

  try {
    const result = await fulfillPaymentAction(orderTrackingId, merchantReference);
    
    // Always respond with the structure PesaPal expects to acknowledge the IPN
    return NextResponse.json({
      OrderTrackingId: orderTrackingId,
      status: 'OK',
      fulfilled: result.success
    });
  } catch (error: any) {
    console.error("[PesaPal IPN Critical Failure]:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
