
import { NextResponse } from 'next/server';
import { processFulfillment } from '@/services/payment-service';

/**
 * @fileOverview Webhook for PesaPal payment notifications.
 * Uses the shared PaymentService to award coins atomically.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  
  const orderTrackingId = searchParams.get('OrderTrackingId') || searchParams.get('orderTrackingId');
  const merchantReference = searchParams.get('OrderMerchantReference') || searchParams.get('orderMerchantReference');

  if (!orderTrackingId || !merchantReference) {
    return NextResponse.json({ status: 'Error', message: 'Missing parameters' }, { status: 400 });
  }

  try {
    const result = await processFulfillment(orderTrackingId, merchantReference);
    
    return NextResponse.json({
      OrderTrackingId: orderTrackingId,
      status: 'OK',
      processed: result.success,
      reason: result.error || 'Success'
    });
  } catch (error: any) {
    console.error("[PesaPal IPN Route] Crash:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
