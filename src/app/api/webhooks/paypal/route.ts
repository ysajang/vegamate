import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getPayPalApiBase, getAccessToken } from '@/lib/payments/paypal/client';
import {
  fulfillGiftTransaction,
  mirrorSubscriptionStatus,
  type SubscriptionStatus,
} from '@/lib/payments/fulfillment';

/**
 * PayPal webhook handler.
 *
 * Security:
 *  - Signature verified via REST POST /v1/notifications/verify-webhook-signature
 *    (the server SDK does not expose webhook verification). Requires
 *    PAYPAL_WEBHOOK_ID (set after registering the webhook URL in the dashboard).
 *  - Idempotency: insert-first into webhook_events (provider,event_id unique);
 *    duplicate delivery -> skip.
 *
 * Events handled:
 *  - PAYMENT.CAPTURE.COMPLETED        -> gift fulfillment double-confirm
 *  - BILLING.SUBSCRIPTION.ACTIVATED   -> active (+started_at)
 *  - BILLING.SUBSCRIPTION.UPDATED     -> refresh period end
 *  - BILLING.SUBSCRIPTION.CANCELLED   -> canceled
 *  - BILLING.SUBSCRIPTION.EXPIRED     -> expired
 *  - BILLING.SUBSCRIPTION.SUSPENDED   -> past_due
 *  - BILLING.SUBSCRIPTION.PAYMENT.FAILED -> past_due
 */

async function verifySignature(req: NextRequest, rawBody: string): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    console.error('[PayPal Webhook] Missing PAYPAL_WEBHOOK_ID');
    return false;
  }

  const transmissionId = req.headers.get('paypal-transmission-id');
  const transmissionTime = req.headers.get('paypal-transmission-time');
  const certUrl = req.headers.get('paypal-cert-url');
  const authAlgo = req.headers.get('paypal-auth-algo');
  const transmissionSig = req.headers.get('paypal-transmission-sig');

  if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
    console.warn('[PayPal Webhook] Missing signature headers');
    return false;
  }

  try {
    const token = await getAccessToken();
    const res = await fetch(`${getPayPalApiBase()}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        transmission_id: transmissionId,
        transmission_time: transmissionTime,
        cert_url: certUrl,
        auth_algo: authAlgo,
        transmission_sig: transmissionSig,
        webhook_id: webhookId,
        webhook_event: JSON.parse(rawBody),
      }),
    });

    if (!res.ok) {
      console.error('[PayPal Webhook] Verify API failed:', res.status);
      return false;
    }

    const json = (await res.json()) as { verification_status?: string };
    return json.verification_status === 'SUCCESS';
  } catch (err) {
    console.error('[PayPal Webhook] Verify error:', err);
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();

    // 1. Verify signature
    const valid = await verifySignature(req, rawBody);
    if (!valid) {
      console.warn('[PayPal Webhook] Invalid signature — rejected');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const event = JSON.parse(rawBody) as {
      id: string;
      event_type: string;
      resource?: Record<string, unknown>;
    };

    const eventId = event.id;
    const eventType = event.event_type;
    const resource = event.resource || {};

    console.log(`[PayPal Webhook] Event: ${eventType} (${eventId})`);

    const serviceClient = createServiceRoleClient();

    // 2. Idempotency: insert-first; unique violation = already processed
    const { error: dupError } = await serviceClient.from('webhook_events').insert({
      provider: 'paypal',
      event_id: eventId,
      event_type: eventType,
    });

    if (dupError) {
      if (dupError.code === '23505') {
        console.log('[PayPal Webhook] Duplicate event, skipping:', eventId);
        return NextResponse.json({ received: true, duplicate: true });
      }
      console.error('[PayPal Webhook] Event ledger insert failed:', dupError);
      // Continue — fulfillment itself is idempotent, so processing is still safe.
    }

    // ── Gift: capture completed (double-confirm with /api/gifts/capture) ────
    if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
      // custom_id was set to our gift_transactions.id at order creation
      const customId = (resource.custom_id as string) || null;
      const captureId = (resource.id as string) || null;

      let txId = customId;
      if (!txId) {
        // Fallback: resolve via order id in supplementary_data
        const orderId =
          ((resource.supplementary_data as Record<string, unknown>)?.related_ids as Record<string, unknown>)
            ?.order_id as string | undefined;
        if (orderId) {
          const { data: tx } = await serviceClient
            .from('gift_transactions')
            .select('id')
            .eq('paypal_order_id', orderId)
            .single();
          txId = tx?.id ?? null;
        }
      }

      if (!txId) {
        console.warn('[PayPal Webhook] Capture event without resolvable tx:', captureId);
        return NextResponse.json({ received: true, unmatched: true });
      }

      // PAYMENT.CAPTURE.COMPLETED resource is the capture itself → amount.value
      const capturedAmount = (() => {
        const amt = (resource.amount as Record<string, unknown> | undefined)?.value;
        return amt != null ? Number(amt) : null;
      })();

      const result = await fulfillGiftTransaction(serviceClient, txId, captureId, capturedAmount);
      return NextResponse.json({
        received: true,
        fulfilled: result.ok,
        already_completed: result.alreadyCompleted ?? false,
      });
    }

    // ── Subscription lifecycle ───────────────────────────────────────────────
    const subEventMap: Record<string, SubscriptionStatus> = {
      'BILLING.SUBSCRIPTION.ACTIVATED': 'active',
      'BILLING.SUBSCRIPTION.UPDATED': 'active',
      'BILLING.SUBSCRIPTION.RE-ACTIVATED': 'active',
      'BILLING.SUBSCRIPTION.SUSPENDED': 'past_due',
      'BILLING.SUBSCRIPTION.PAYMENT.FAILED': 'past_due',
      'BILLING.SUBSCRIPTION.CANCELLED': 'canceled',
      'BILLING.SUBSCRIPTION.EXPIRED': 'expired',
    };

    if (eventType in subEventMap) {
      const paypalSubId = (resource.id as string) || null;
      const customId = (resource.custom_id as string) || null;
      const billingInfo = resource.billing_info as Record<string, unknown> | undefined;
      const periodEnd = (billingInfo?.next_billing_time as string) || null;

      const result = await mirrorSubscriptionStatus(serviceClient, {
        subscriptionRowId: customId,
        paypalSubscriptionId: paypalSubId,
        newStatus: subEventMap[eventType],
        periodEnd,
        markStarted: eventType === 'BILLING.SUBSCRIPTION.ACTIVATED',
      });

      if (!result.ok) {
        console.warn('[PayPal Webhook] Subscription row not found:', paypalSubId, customId);
        return NextResponse.json({ received: true, subscription_unmatched: true });
      }

      return NextResponse.json({ received: true, subscription_status: subEventMap[eventType] });
    }

    // Unhandled event types are acknowledged (avoid PayPal retries)
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('[PayPal Webhook] Unhandled error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
