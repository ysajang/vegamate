import { NextRequest } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiError, withErrorHandler, AppError } from '@/lib/api-utils';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { sanitizeString, isValidUUID } from '@/lib/validators';
import { getOrdersController } from '@/lib/payments/paypal/client';
import { fulfillGiftTransaction } from '@/lib/payments/fulfillment';

/**
 * Capture a PayPal gift order after buyer approval (redirect return).
 *
 * Flow: buyer approves on PayPal -> redirected to /payment/return with
 * ?token={orderId} -> this endpoint captures and credits hearts.
 *
 * Idempotency (double-confirm with webhook):
 *  - fulfillGiftTransaction is status-guarded; whichever of capture/webhook
 *    runs first credits hearts, the other no-ops.
 *  - PayPal ORDER_ALREADY_CAPTURED is treated as success and re-checked.
 */
async function handler(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const rl = checkRateLimit(`gift-capture:${user.id}`, RATE_LIMITS.api);
  if (!rl.allowed) {
    return apiError('Too many requests', 429);
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    throw new AppError('Invalid request body');
  }

  const txId = sanitizeString(body.transaction_id);
  const orderId = sanitizeString(body.order_id);
  const cancelled = body.cancelled === true;

  if (!txId || !isValidUUID(txId)) {
    throw new AppError('Invalid transaction_id');
  }
  if (!cancelled && !orderId) {
    throw new AppError('order_id is required');
  }

  const serviceClient = createServiceRoleClient();

  // Ownership + linkage check: tx must belong to caller and match the order id
  const { data: tx } = await serviceClient
    .from('gift_transactions')
    .select('id, status, user_id, paypal_order_id, hearts_granted, gift:gifts(price_usd)')
    .eq('id', txId)
    .single();

  if (!tx || tx.user_id !== user.id) {
    throw new AppError('Transaction not found', 404);
  }

  const giftPrice = Number(
    (tx as unknown as { gift?: { price_usd?: number | string } }).gift?.price_usd ?? 0
  );

  // Release the up-front spend reservation back to the daily cap. Used on
  // both explicit cancel and any capture failure so an abandoned checkout
  // never permanently eats the user's $50/day headroom (revenue leak).
  const releaseReserve = async () => {
    if (giftPrice > 0) {
      try {
        await serviceClient.rpc('release_reserved_spend', {
          p_user_id: user.id,
          p_amount_usd: giftPrice,
        });
      } catch (err) {
        console.warn('[Capture] release_reserved_spend failed (non-critical):', err);
      }
    }
  };

  // Buyer cancelled on PayPal (no capture happened): mark failed + release.
  if (cancelled) {
    if (tx.status === 'pending') {
      await serviceClient.from('gift_transactions').update({ status: 'failed' }).eq('id', tx.id);
      await releaseReserve();
    }
    return apiSuccess({ cancelled: true });
  }

  if (tx.paypal_order_id !== orderId) {
    throw new AppError('Order mismatch', 400);
  }

  if (tx.status === 'completed') {
    return apiSuccess({ already_completed: true, hearts_granted: tx.hearts_granted });
  }
  if (tx.status === 'failed') {
    throw new AppError('Transaction already failed', 409);
  }

  // Capture
  const orders = getOrdersController();
  let captureId: string | null = null;
  let capturedAmount: number | null = null;
  let captured = false;

  const extractCapture = (result: {
    purchaseUnits?: Array<{
      payments?: { captures?: Array<{ id?: string; amount?: { value?: string } }> };
    }>;
  }) => {
    const cap = result.purchaseUnits?.[0]?.payments?.captures?.[0];
    captureId = cap?.id ?? null;
    const v = cap?.amount?.value;
    capturedAmount = v != null ? Number(v) : null;
  };

  try {
    const { result, statusCode } = await orders.captureOrder({ id: orderId });

    if (statusCode < 400 && result?.status === 'COMPLETED') {
      captured = true;
      extractCapture(result);
    } else {
      console.error('[Capture] Unexpected capture result:', statusCode, result?.status);
    }
  } catch (err: unknown) {
    // ORDER_ALREADY_CAPTURED -> verify via GET and proceed (idempotent)
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('ORDER_ALREADY_CAPTURED')) {
      try {
        const { result } = await orders.getOrder({ id: orderId });
        if (result?.status === 'COMPLETED') {
          captured = true;
          extractCapture(result);
        }
      } catch (verifyErr) {
        console.error('[Capture] Verify after ALREADY_CAPTURED failed:', verifyErr);
      }
    } else {
      console.error('[Capture] PayPal capture error:', msg);
    }
  }

  if (!captured) {
    // Capture failed and no money moved → return the reservation.
    if (tx.status === 'pending') {
      await serviceClient.from('gift_transactions').update({ status: 'failed' }).eq('id', tx.id);
      await releaseReserve();
    }
    throw new AppError('Payment capture failed', 402);
  }

  const fulfill = await fulfillGiftTransaction(serviceClient, txId, captureId, capturedAmount);

  if (!fulfill.ok) {
    // Money captured but credit failed — log loudly; webhook retry will heal.
    console.error('[Capture] CRITICAL: captured but fulfillment failed:', txId, fulfill.error);
    throw new AppError('Payment received; crediting is being finalized. Contact support if hearts do not appear shortly.', 500);
  }

  return apiSuccess({
    completed: true,
    already_completed: fulfill.alreadyCompleted ?? false,
    hearts_granted: tx.hearts_granted,
    new_balance: fulfill.newBalance ?? null,
  });
}

export const POST = withErrorHandler(handler);
