import { NextRequest } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiError, withErrorHandler, AppError } from '@/lib/api-utils';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { sanitizeString } from '@/lib/validators';
import { APP_CONFIG } from '@/config/constants';
import { isPayPalActive } from '@/lib/payments/provider';
import { getSubscriptionsController } from '@/lib/payments/paypal/client';

/**
 * Create a checkout for a subscription tier.
 *
 * Provider: PayPal (Subscriptions API, redirect approval flow) — Creem path
 * kept behind the provider switch.
 *
 * Compliance / safety in this route:
 *  - age gate + daily spend cap + rapid-purchase cooldown via
 *    check_and_reserve_spend (atomic). Blocked attempts are logged, not charged.
 *  - every intent (allowed or blocked) is written to payment_intent_log.
 *  - prices come from the DB tier row (single source of truth, shown to user).
 *
 * Billing plumbing stays with the provider; webhook mirrors resulting status.
 */
async function handler(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const rl = checkRateLimit(`sub-checkout:${user.id}`, RATE_LIMITS.api);
  if (!rl.allowed) {
    return apiError('Too many requests', 429);
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    throw new AppError('Invalid request body');
  }

  const tierSlug = sanitizeString(body.tier_slug);
  const surface = sanitizeString(body.surface) || 'upgrade_prompt';
  const characterId = body.character_id ? sanitizeString(body.character_id) : null;

  if (!tierSlug) {
    throw new AppError('tier_slug is required');
  }

  const serviceClient = createServiceRoleClient();

  // 1. Load tier (price is authoritative here)
  const { data: tier, error: tierError } = await serviceClient
    .from('subscription_tiers')
    .select('*')
    .eq('slug', tierSlug)
    .eq('is_active', true)
    .single();

  if (tierError || !tier) {
    throw new AppError('Subscription tier not found', 404);
  }

  // 2. Reject if already subscribed (active)
  const { data: activeSub } = await serviceClient.rpc('get_active_subscription', {
    p_user_id: user.id,
  });
  if (activeSub?.active) {
    throw new AppError('You already have an active subscription', 409);
  }

  // 3. Spending guard: age gate + daily cap + cooldown (atomic reserve)
  const { data: guard } = await serviceClient.rpc('check_and_reserve_spend', {
    p_user_id: user.id,
    p_amount_usd: tier.price_usd,
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
      kind: 'subscription',
      ref_slug: tierSlug,
      amount_usd: tier.price_usd,
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

  // 4. Create pending subscription row
  const { data: sub, error: subError } = await serviceClient
    .from('subscriptions')
    .insert({
      user_id: user.id,
      tier_id: tier.id,
      status: 'pending',
    })
    .select()
    .single();

  if (subError || !sub) {
    console.error('[Sub] Failed to create subscription row:', subError);
    throw new AppError('Failed to initiate subscription', 500);
  }

  // 5. Log allowed intent
  await serviceClient.from('payment_intent_log').insert({
    user_id: user.id,
    kind: 'subscription',
    ref_slug: tierSlug,
    amount_usd: tier.price_usd,
    surface,
    guard_result: 'allowed',
    character_id: characterId,
  });

  // 6. Provider branch
  if (isPayPalActive()) {
    return createPayPalSubscription({ serviceClient, sub, tier, tierSlug });
  }
  return createCreemSubscriptionCheckout({ serviceClient, sub, tier, tierSlug, user });
}

// ─── PayPal: Subscriptions API, redirect approval flow ──────────────────────
async function createPayPalSubscription({
  serviceClient,
  sub,
  tier,
  tierSlug,
}: {
  serviceClient: ReturnType<typeof createServiceRoleClient>;
  sub: { id: string };
  tier: { paypal_plan_id: string | null; name: string };
  tierSlug: string;
}) {
  if (!tier.paypal_plan_id) {
    console.error(`[Sub] No paypal_plan_id for tier: ${tierSlug}`);
    await serviceClient
      .from('subscriptions')
      .update({ status: 'canceled', canceled_at: new Date().toISOString() })
      .eq('id', sub.id);
    throw new AppError('Subscription not available for purchase yet', 503);
  }

  try {
    const subs = getSubscriptionsController();

    const { result, statusCode } = await subs.createSubscription({
      body: {
        planId: tier.paypal_plan_id,
        customId: sub.id,
        applicationContext: {
          brandName: 'VegaMate',
          // See gifts/purchase: explicit locale prevents PayPal from defaulting
          // the checkout to the seller's KR locale, which blocked overseas buyers.
          locale: 'en-US',
          userAction: 'SUBSCRIBE_NOW' as never,
          returnUrl: `${APP_CONFIG.url}/payment/return?type=subscription&sub=${sub.id}`,
          cancelUrl: `${APP_CONFIG.url}/payment/return?type=subscription&sub=${sub.id}&cancelled=true`,
        },
      },
    });

    if (statusCode >= 400 || !result?.id) {
      console.error('[Sub] PayPal subscription create failed:', statusCode, JSON.stringify(result));
      await serviceClient
        .from('subscriptions')
        .update({ status: 'canceled', canceled_at: new Date().toISOString() })
        .eq('id', sub.id);
      throw new AppError('Payment initiation failed', 500);
    }

    const approveLink = result.links?.find((l) => l.rel === 'approve')?.href;
    if (!approveLink) {
      console.error('[Sub] No approval link in PayPal subscription:', result.id);
      await serviceClient
        .from('subscriptions')
        .update({ status: 'canceled', canceled_at: new Date().toISOString() })
        .eq('id', sub.id);
      throw new AppError('Payment initiation failed', 500);
    }

    await serviceClient
      .from('subscriptions')
      .update({ paypal_subscription_id: result.id })
      .eq('id', sub.id);

    console.log(`[Sub] PayPal subscription created: ${result.id} row=${sub.id}`);

    return apiSuccess({
      checkout_url: approveLink,
      subscription_id: sub.id,
      provider: 'paypal',
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error('[Sub] PayPal subscription creation error:', err);
    await serviceClient
      .from('subscriptions')
      .update({ status: 'canceled', canceled_at: new Date().toISOString() })
      .eq('id', sub.id);
    throw new AppError('Payment initiation failed', 500);
  }
}

// ─── Creem: legacy path, kept for provider switch ────────────────────────────
async function createCreemSubscriptionCheckout({
  serviceClient,
  sub,
  tier,
  tierSlug,
  user,
}: {
  serviceClient: ReturnType<typeof createServiceRoleClient>;
  sub: { id: string };
  tier: { creem_product_id: string | null };
  tierSlug: string;
  user: { id: string };
}) {
  if (!tier.creem_product_id) {
    console.error(`[Sub] No creem_product_id for tier: ${tierSlug}`);
    throw new AppError('Subscription not available for purchase yet', 503);
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
        product_id: tier.creem_product_id,
        success_url: `${APP_CONFIG.url}/chat?sub_success=true&sub=${sub.id}`,
        request_id: sub.id,
        metadata: {
          user_id: user.id,
          kind: 'subscription',
          tier_slug: tierSlug,
          subscription_id: sub.id,
        },
      }),
    });

    if (!checkoutRes.ok) {
      const errText = await checkoutRes.text().catch(() => 'Unknown error');
      console.error('[Sub] Creem checkout failed:', checkoutRes.status, errText);
      await serviceClient
        .from('subscriptions')
        .update({ status: 'canceled', canceled_at: new Date().toISOString() })
        .eq('id', sub.id);
      throw new AppError('Payment initiation failed', 500);
    }

    const checkoutData = await checkoutRes.json();

    await serviceClient
      .from('subscriptions')
      .update({ creem_checkout_id: checkoutData.id })
      .eq('id', sub.id);

    return apiSuccess({
      checkout_url: checkoutData.checkout_url,
      subscription_id: sub.id,
      provider: 'creem',
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error('[Sub] Checkout creation error:', err);
    await serviceClient
      .from('subscriptions')
      .update({ status: 'canceled', canceled_at: new Date().toISOString() })
      .eq('id', sub.id);
    throw new AppError('Payment initiation failed', 500);
  }
}

export const POST = withErrorHandler(handler);
