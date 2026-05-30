import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import crypto from 'crypto';

/**
 * Creem webhook handler.
 * Receives payment confirmation and credits hearts to user.
 *
 * Creem sends: checkout.completed event with metadata we set during checkout.
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Verify webhook signature
    const webhookSecret = process.env.CREEM_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('[Webhook] Missing CREEM_WEBHOOK_SECRET');
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
    }

    const rawBody = await req.text();
    const signature = req.headers.get('creem-signature') || req.headers.get('x-creem-signature') || '';

    // Verify HMAC signature
    const expectedSig = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      console.warn('[Webhook] Invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // 2. Parse payload
    const payload = JSON.parse(rawBody);
    const eventType = payload.event_type || payload.type;

    console.log(`[Webhook] Received event: ${eventType}`);

    // Only process checkout.completed
    if (eventType !== 'checkout.completed') {
      return NextResponse.json({ received: true });
    }

    const data = payload.data || payload;
    const metadata = data.metadata || {};
    const giftTxId = metadata.gift_tx_id;
    const userId = metadata.user_id;
    const heartsGranted = metadata.hearts_granted;
    const checkoutId = data.id || data.checkout_id;

    if (!giftTxId || !userId || !heartsGranted) {
      console.error('[Webhook] Missing metadata fields:', { giftTxId, userId, heartsGranted });
      return NextResponse.json({ error: 'Missing metadata' }, { status: 400 });
    }

    const serviceClient = createServiceRoleClient();

    // 3. Check idempotency — transaction already completed?
    const { data: existingTx } = await serviceClient
      .from('gift_transactions')
      .select('id, status')
      .eq('id', giftTxId)
      .single();

    if (!existingTx) {
      console.error('[Webhook] Transaction not found:', giftTxId);
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    if (existingTx.status === 'completed') {
      console.log('[Webhook] Transaction already completed (idempotent):', giftTxId);
      return NextResponse.json({ received: true, already_processed: true });
    }

    // 4. Add hearts to user
    const { data: newBalance } = await serviceClient.rpc('add_hearts', {
      p_user_id: userId,
      p_amount: Number(heartsGranted),
    });

    if (newBalance === null || newBalance === undefined) {
      console.error('[Webhook] Failed to add hearts for user:', userId);
      return NextResponse.json({ error: 'Failed to credit hearts' }, { status: 500 });
    }

    // 5. Mark transaction as completed
    await serviceClient
      .from('gift_transactions')
      .update({
        status: 'completed',
        creem_payment_id: checkoutId,
      })
      .eq('id', giftTxId);

    // 5.5. A gift is the strongest intimacy signal. Bump the relationship on
    // the conversation for this user+character so the next emotional peak
    // (and any upgrade moment) reflects it. Non-fatal if it fails.
    try {
      const characterId = metadata.character_id;
      if (characterId) {
        const { data: conv } = await serviceClient
          .from('conversations')
          .select('id')
          .eq('user_id', userId)
          .eq('character_id', characterId)
          .single();

        if (conv?.id) {
          const giftPoints = Math.floor(Number(heartsGranted) / 10);
          if (giftPoints > 0) {
            await serviceClient.rpc('bump_intimacy', {
              p_conversation_id: conv.id,
              p_points: giftPoints,
            });
          }
        }
      }
    } catch (intimacyErr) {
      console.warn('[Webhook] Intimacy bump after gift failed (non-critical):', intimacyErr);
    }

    console.log(
      `[Webhook] Gift completed: user=${userId} hearts=+${heartsGranted} balance=${newBalance} tx=${giftTxId}`
    );

    return NextResponse.json({ received: true, hearts_added: heartsGranted });
  } catch (err) {
    console.error('[Webhook] Unhandled error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
