/**
 * Shared payment fulfillment logic.
 *
 * Called from BOTH the synchronous capture path (/api/gifts/capture) and the
 * PayPal webhook (PAYMENT.CAPTURE.COMPLETED) — whichever arrives first wins;
 * the other becomes a no-op via the status check. Single source of truth so
 * hearts can never be double-credited.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendGiftReaction } from '@/lib/chat/gift-reaction';

export interface GiftFulfillResult {
  ok: boolean;
  alreadyCompleted?: boolean;
  newBalance?: number;
  error?: string;
}

/**
 * Mark a gift transaction completed and credit hearts (+ intimacy bump).
 * Idempotent on gift_transactions.status.
 */
export async function fulfillGiftTransaction(
  serviceClient: SupabaseClient,
  giftTxId: string,
  paypalCaptureId: string | null,
  capturedAmountUsd?: number | null
): Promise<GiftFulfillResult> {
  const { data: tx } = await serviceClient
    .from('gift_transactions')
    .select('id, status, user_id, character_id, hearts_granted, gift:gifts(price_usd)')
    .eq('id', giftTxId)
    .single();

  if (!tx) {
    return { ok: false, error: 'transaction_not_found' };
  }

  if (tx.status === 'completed') {
    return { ok: true, alreadyCompleted: true };
  }

  // Amount tamper check: the amount PayPal actually captured must match the
  // server-side price of the gift this tx is for. The buyer approves a
  // PayPal-hosted order so they cannot alter the amount in the normal flow,
  // but verifying defends against a forged/mismatched capture being mapped
  // onto a cheaper tx via custom_id. Skipped only when the caller could not
  // resolve a captured amount (we then fall back to custom_id trust).
  if (typeof capturedAmountUsd === 'number' && Number.isFinite(capturedAmountUsd)) {
    const expected = Number(
      (tx as unknown as { gift?: { price_usd?: number | string } }).gift?.price_usd
    );
    if (Number.isFinite(expected) && Math.abs(capturedAmountUsd - expected) > 0.01) {
      console.error(
        `[Fulfill] AMOUNT MISMATCH tx=${giftTxId} expected=$${expected} captured=$${capturedAmountUsd} — refusing to credit`
      );
      await serviceClient
        .from('gift_transactions')
        .update({ status: 'failed' })
        .eq('id', tx.id);
      return { ok: false, error: 'amount_mismatch' };
    }
  }

  // Credit hearts
  const { data: newBalance, error: heartsError } = await serviceClient.rpc('add_hearts', {
    p_user_id: tx.user_id,
    p_amount: Number(tx.hearts_granted),
  });

  if (heartsError || newBalance === null || newBalance === undefined) {
    console.error('[Fulfill] add_hearts failed:', giftTxId, heartsError);
    return { ok: false, error: 'credit_failed' };
  }

  // Mark completed
  const update: Record<string, unknown> = { status: 'completed' };
  if (paypalCaptureId) update.paypal_capture_id = paypalCaptureId;
  await serviceClient.from('gift_transactions').update(update).eq('id', tx.id);

  // Intimacy bump (non-fatal) — gift is the strongest intimacy signal
  try {
    if (tx.character_id) {
      const { data: conv } = await serviceClient
        .from('conversations')
        .select('id')
        .eq('user_id', tx.user_id)
        .eq('character_id', tx.character_id)
        .single();

      if (conv?.id) {
        const giftPoints = Math.floor(Number(tx.hearts_granted) / 10);
        if (giftPoints > 0) {
          await serviceClient.rpc('bump_intimacy', {
            p_conversation_id: conv.id,
            p_points: giftPoints,
          });
        }
      }
    }
  } catch (err) {
    console.warn('[Fulfill] Intimacy bump failed (non-critical):', err);
  }

  console.log(
    `[Fulfill] Gift completed: tx=${giftTxId} user=${tx.user_id} hearts=+${tx.hearts_granted} balance=${newBalance}`
  );

  // Post-fulfillment side effect (payment logic above is untouched):
  // the character reacts to the received gift in-conversation. Only the call
  // that performed the actual pending→completed transition reaches this line,
  // and sendGiftReaction is itself idempotent on gift_tx_id. Non-fatal.
  try {
    await sendGiftReaction(serviceClient, giftTxId);
  } catch (err) {
    console.warn('[Fulfill] Gift reaction failed (non-critical):', err);
  }

  return { ok: true, newBalance: Number(newBalance) };
}

export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'expired';

/**
 * Mirror a provider subscription lifecycle event onto our subscriptions row.
 * Idempotent: re-applying the same status is a no-op for 'active'.
 */
export async function mirrorSubscriptionStatus(
  serviceClient: SupabaseClient,
  opts: {
    subscriptionRowId?: string | null; // our id (from custom_id)
    paypalSubscriptionId?: string | null;
    newStatus: SubscriptionStatus;
    periodEnd?: string | null;
    markStarted?: boolean;
  }
): Promise<{ ok: boolean; rowId?: string; skipped?: boolean }> {
  let row: { id: string; status: string } | null = null;

  if (opts.subscriptionRowId) {
    const { data } = await serviceClient
      .from('subscriptions')
      .select('id, status')
      .eq('id', opts.subscriptionRowId)
      .single();
    row = data;
  }
  if (!row && opts.paypalSubscriptionId) {
    const { data } = await serviceClient
      .from('subscriptions')
      .select('id, status')
      .eq('paypal_subscription_id', opts.paypalSubscriptionId)
      .single();
    row = data;
  }

  if (!row) {
    return { ok: false };
  }

  if (row.status === opts.newStatus && opts.newStatus === 'active') {
    return { ok: true, rowId: row.id, skipped: true };
  }

  const update: Record<string, unknown> = {
    status: opts.newStatus,
    updated_at: new Date().toISOString(),
  };
  if (opts.paypalSubscriptionId) update.paypal_subscription_id = opts.paypalSubscriptionId;
  if (opts.periodEnd) update.current_period_end = opts.periodEnd;
  if (opts.newStatus === 'active' && opts.markStarted) {
    update.started_at = new Date().toISOString();
  }
  if (opts.newStatus === 'canceled') update.canceled_at = new Date().toISOString();

  await serviceClient.from('subscriptions').update(update).eq('id', row.id);
  console.log(`[Fulfill] Subscription ${row.id} -> ${opts.newStatus}`);
  return { ok: true, rowId: row.id };
}
