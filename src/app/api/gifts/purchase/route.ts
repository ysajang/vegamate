import { NextRequest } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiError, withErrorHandler, AppError } from '@/lib/api-utils';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { sanitizeString, isValidUUID } from '@/lib/validators';
import { APP_CONFIG } from '@/config/constants';
import { isPayPalActive } from '@/lib/payments/provider';
import { minGiftUsdForTier } from '@/lib/chat/selfie-economy';
import { getOrdersController } from '@/lib/payments/paypal/client';
import {
  CheckoutPaymentIntent,
  PayeePaymentMethodPreference,
  PaypalExperienceLandingPage,
  PaypalExperienceUserAction,
} from '@paypal/paypal-server-sdk';

/**
 * Mark a gift tx failed AND release the spend it reserved at intent time.
 *
 * check_and_reserve_spend debits the daily cap up-front; if the PayPal flow
 * never completes (order create error, no approval link, abandoned checkout),
 * that reservation must be returned or it silently eats the user's $50/day cap
 * and blocks later legitimate purchases. Single helper so every failure path
 * releases consistently. Release is same-day, clamped at 0, does NOT reset cooldown.
 */
async function failGiftTx(
  serviceClient: ReturnType<typeof createServiceRoleClient>,
  txId: string,
  userId: string,
  amountUsd: number
): Promise<void> {
  await serviceClient.from('gift_transactions').update({ status: 'failed' }).eq('id', txId);
  try {
    await serviceClient.rpc('release_reserved_spend', {
      p_user_id: userId,
      p_amount_usd: amountUsd,
    });
  } catch (err) {
    console.warn('[Gift] release_reserved_spend failed (non-critical):', err);
  }
}

/**
 * Create a checkout for a one-time gift purchase.
 *
 * Provider: PayPal (Orders v2, redirect approval flow) — Creem path kept
 * behind the provider switch. Compliance:
 *  - age gate + daily cap + cooldown via check_and_reserve_spend (atomic)
 *  - every intent (allowed or blocked) written to payment_intent_log
 *  - product naming stays non-explicit ("VegaMate Gift — {name}") per PayPal AUP
 */
async function handler(req: NextRequest) {
  // 1. Auth check
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  // 2. Rate limit
  const rl = checkRateLimit(`gift-purchase:${user.id}`, RATE_LIMITS.api);
  if (!rl.allowed) {
    return apiError('Too many requests', 429);
  }

  // 3. Parse input
  const body = await req.json().catch(() => null);
  if (!body) {
    throw new AppError('Invalid request body');
  }

  const giftSlug = sanitizeString(body.gift_slug);
  const characterId = sanitizeString(body.character_id);
  const surface = sanitizeString(body.surface) || 'gift_sheet';
  // Blur-teaser unlock: optional binding — this purchase unblurs ONE specific
  // premium card on webhook confirmation. Validated below (premium + same
  // character + $4.99+ gift); invalid bindings are dropped, never fatal.
  const unblurSelfieIdRaw = sanitizeString(body.unblur_selfie_id ?? '');

  if (!giftSlug) {
    throw new AppError('gift_slug is required');
  }
  if (!characterId || !isValidUUID(characterId)) {
    throw new AppError('Invalid character_id');
  }

  const serviceClient = createServiceRoleClient();

  // 4. Validate gift exists
  const { data: gift, error: giftError } = await serviceClient
    .from('gifts')
    .select('*')
    .eq('slug', giftSlug)
    .eq('is_active', true)
    .single();

  if (giftError || !gift) {
    throw new AppError('Gift not found', 404);
  }

  // 5. Validate character exists
  const { data: character } = await serviceClient
    .from('characters')
    .select('id, name')
    .eq('id', characterId)
    .eq('is_active', true)
    .single();

  if (!character) {
    throw new AppError('Character not found', 404);
  }

  // 6. Spending guard: age gate + daily cap + cooldown (atomic reserve).
  //    Same guard as subscriptions — gifts must not bypass it.
  const { data: guard } = await serviceClient.rpc('check_and_reserve_spend', {
    p_user_id: user.id,
    p_amount_usd: gift.price_usd,
  });

  const guardResultMap: Record<string, 'allowed' | 'blocked_age' | 'blocked_cap' | 'blocked_cooldown'> = {
    blocked_age: 'blocked_age',
    blocked_cap: 'blocked_cap',
    blocked_cooldown: 'blocked_cooldown',
  };

  if (!guard?.allowed) {
    const reason = (guard?.reason as string) || 'blocked_cap';
    await serviceClient.from('payment_intent_log').insert({
      user_id: user.id,
      kind: 'gift',
      ref_slug: giftSlug,
      amount_usd: gift.price_usd,
      surface,
      guard_result: guardResultMap[reason] || 'blocked_cap',
      character_id: characterId,
    });

    return apiSuccess({
      blocked: true,
      reason:
        reason === 'blocked_age'
          ? 'age_gate'
          : reason === 'blocked_cooldown'
            ? 'cooldown'
            : 'daily_cap',
      retry_after_seconds: guard?.retry_after_seconds ?? null,
      cap: guard?.cap ?? null,
      spent_today: guard?.spent_today ?? null,
    });
  }

  // 6.5 Validate the unblur binding (best-effort; drop silently when invalid).
  // Selfie-economy pivot: free-tier blurred cards unlock from $1.99, premium
  // tiers keep the $4.99 floor — the threshold follows the TARGET's tier.
  let unblurSelfieId: string | null = null;
  if (unblurSelfieIdRaw && isValidUUID(unblurSelfieIdRaw)) {
    const { data: target } = await serviceClient
      .from('selfie_pool')
      .select('id, tier, character_id')
      .eq('id', unblurSelfieIdRaw)
      .single();
    if (
      target &&
      target.character_id === characterId &&
      Number(gift.price_usd) >= minGiftUsdForTier(target.tier) - 0.01
    ) {
      unblurSelfieId = target.id;
    }
  }

  // 7. Log allowed intent
  await serviceClient.from('payment_intent_log').insert({
    user_id: user.id,
    kind: 'gift',
    ref_slug: giftSlug,
    amount_usd: gift.price_usd,
    surface,
    guard_result: 'allowed',
    character_id: characterId,
  });

  // 8. Hearts granted = the gift's fixed value (server-authoritative).
  //    Randomized payouts were removed: a paid random reward is a loot box
  //    (PayPal gambling classification + app-store gambling policy). All gifts
  //    now grant a deterministic, disclosed amount.
  const heartsToGrant = gift.hearts_value;

  // 9. Create pending transaction
  const { data: tx, error: txError } = await serviceClient
    .from('gift_transactions')
    .insert({
      ...(unblurSelfieId ? { unblur_selfie_id: unblurSelfieId } : {}),
      user_id: user.id,
      character_id: characterId,
      gift_id: gift.id,
      hearts_granted: heartsToGrant,
      status: 'pending',
    })
    .select()
    .single();

  if (txError || !tx) {
    console.error('[Gift] Failed to create transaction:', txError);
    throw new AppError('Failed to initiate purchase', 500);
  }

  // 10. Provider branch
  if (isPayPalActive()) {
    return createPayPalGiftOrder({ serviceClient, tx, gift, user });
  }
  return createCreemGiftCheckout({ serviceClient, tx, gift, giftSlug, characterId, user, heartsToGrant });
}

// ─── PayPal: Orders v2, redirect approval flow ──────────────────────────────
async function createPayPalGiftOrder({
  serviceClient,
  tx,
  gift,
  user,
}: {
  serviceClient: ReturnType<typeof createServiceRoleClient>;
  tx: { id: string };
  gift: { name: string; price_usd: number };
  user: { id: string };
}) {
  try {
    const orders = getOrdersController();
    const price = Number(gift.price_usd).toFixed(2);

    const { result, statusCode } = await orders.createOrder({
      body: {
        intent: CheckoutPaymentIntent.Capture,
        purchaseUnits: [
          {
            referenceId: tx.id,
            customId: tx.id,
            description: `VegaMate Gift — ${gift.name}`,
            amount: {
              currencyCode: 'USD',
              value: price,
            },
          },
        ],
        // Guest card checkout: experience_context is the SDK-recommended home
        // for these fields (application_context is deprecated).
        //
        // Two settings together surface the "Debit or Credit Card" form first:
        //  - landingPage=GUEST_CHECKOUT: pick the guest (card) landing page
        //    instead of the account-login page.
        //  - paymentMethodPreference=IMMEDIATE_PAYMENT_REQUIRED: exclude
        //    deferred methods (Pay Later / balance) so PayPal resolves to an
        //    immediate-pay flow. Without this, GUEST_CHECKOUT alone can still
        //    fall back to the login/wallet screen — this was why the card form
        //    did not appear after the previous landingPage-only change.
        //
        // NOTE: PayPal may still force login by IP/risk in some markets; this
        // only guarantees the option is offered, not that guest is permitted.
        paymentSource: {
          paypal: {
            experienceContext: {
              brandName: 'VegaMate',
              // locale must be set explicitly. Without it PayPal derives the
              // checkout locale/country from the *seller* account (KR), so the
              // hosted card form defaulted to "대한민국"/+82 even for non-KR
              // buyers — which then tripped PayPal's "KR-to-KR transfers not
              // allowed" block. en-US makes the country selector default to a
              // neutral non-KR locale so overseas buyers can actually pay.
              locale: 'en-US',
              landingPage: PaypalExperienceLandingPage.GuestCheckout,
              paymentMethodPreference: PayeePaymentMethodPreference.ImmediatePaymentRequired,
              userAction: PaypalExperienceUserAction.PayNow,
              returnUrl: `${APP_CONFIG.url}/payment/return?type=gift&tx=${tx.id}`,
              cancelUrl: `${APP_CONFIG.url}/payment/return?type=gift&tx=${tx.id}&cancelled=true`,
            },
          },
        },
      },
    });

    if (statusCode >= 400 || !result?.id) {
      console.error('[Gift] PayPal order create failed:', statusCode, JSON.stringify(result));
      await failGiftTx(serviceClient, tx.id, user.id, gift.price_usd);
      throw new AppError('Payment initiation failed', 500);
    }

    const approveLink = result.links?.find(
      (l) => l.rel === 'approve' || l.rel === 'payer-action'
    )?.href;

    if (!approveLink) {
      console.error('[Gift] No approval link in PayPal order:', result.id);
      await failGiftTx(serviceClient, tx.id, user.id, gift.price_usd);
      throw new AppError('Payment initiation failed', 500);
    }

    // Card-first hint: append fundingSource=card so PayPal's hosted page tends
    // to surface the "Debit or Credit Card" form rather than the login/wallet
    // screen. This complements the server-side GuestCheckout +
    // ImmediatePaymentRequired settings. NOTE: not officially guaranteed —
    // PayPal may still force login by IP/risk in some markets — so it is a
    // best-effort nudge layered on top of the order-level settings, not a
    // replacement for them. (Confidence: not 100%.)
    const checkoutUrl = approveLink.includes('fundingSource=')
      ? approveLink
      : `${approveLink}${approveLink.includes('?') ? '&' : '?'}fundingSource=card`;

    await serviceClient
      .from('gift_transactions')
      .update({ paypal_order_id: result.id })
      .eq('id', tx.id);

    console.log(`[Gift] PayPal order created: order=${result.id} tx=${tx.id} user=${user.id}`);

    return apiSuccess({
      checkout_url: checkoutUrl,
      transaction_id: tx.id,
      provider: 'paypal',
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error('[Gift] PayPal order creation error:', err);
    await failGiftTx(serviceClient, tx.id, user.id, gift.price_usd);
    throw new AppError('Payment initiation failed', 500);
  }
}

// ─── Creem: legacy path, kept for provider switch ────────────────────────────
async function createCreemGiftCheckout({
  serviceClient,
  tx,
  gift,
  giftSlug,
  characterId,
  user,
  heartsToGrant,
}: {
  serviceClient: ReturnType<typeof createServiceRoleClient>;
  tx: { id: string };
  gift: { creem_product_id: string | null; price_usd: number };
  giftSlug: string;
  characterId: string;
  user: { id: string };
  heartsToGrant: number;
}) {
  if (!gift.creem_product_id) {
    console.error(`[Gift] No creem_product_id for gift: ${giftSlug}`);
    throw new AppError('Gift not available for purchase', 500);
  }

  const creemApiKey = process.env.CREEM_API_KEY;
  if (!creemApiKey) {
    throw new AppError('Payment system unavailable', 500);
  }

  const creemBaseUrl = process.env.CREEM_API_URL || 'https://api.creem.io/v1';

  try {
    const checkoutRes = await fetch(`${creemBaseUrl}/checkouts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': creemApiKey,
      },
      body: JSON.stringify({
        product_id: gift.creem_product_id,
        success_url: `${APP_CONFIG.url}/chat?gift_success=true&tx=${tx.id}`,
        request_id: tx.id,
        metadata: {
          user_id: user.id,
          character_id: characterId,
          gift_slug: giftSlug,
          gift_tx_id: tx.id,
          hearts_granted: heartsToGrant,
        },
      }),
    });

    if (!checkoutRes.ok) {
      const errText = await checkoutRes.text().catch(() => 'Unknown error');
      console.error('[Gift] Creem checkout failed:', checkoutRes.status, errText);
      await failGiftTx(serviceClient, tx.id, user.id, gift.price_usd);
      throw new AppError('Payment initiation failed', 500);
    }

    const checkoutData = await checkoutRes.json();

    await serviceClient
      .from('gift_transactions')
      .update({ creem_checkout_id: checkoutData.id })
      .eq('id', tx.id);

    return apiSuccess({
      checkout_url: checkoutData.checkout_url,
      transaction_id: tx.id,
      provider: 'creem',
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error('[Gift] Checkout creation error:', err);
    await failGiftTx(serviceClient, tx.id, user.id, gift.price_usd);
    throw new AppError('Payment initiation failed', 500);
  }
}

export const POST = withErrorHandler(handler);
