import { NextRequest } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiError, withErrorHandler, AppError } from '@/lib/api-utils';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { sanitizeString, isValidUUID } from '@/lib/validators';
import { APP_CONFIG } from '@/config/constants';

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

  // 6. Check Creem product ID is configured
  if (!gift.creem_product_id) {
    console.error(`[Gift] No creem_product_id for gift: ${giftSlug}`);
    throw new AppError('Gift not available for purchase', 500);
  }

  // 7. Calculate hearts for surprise gift
  let heartsToGrant = gift.hearts_value;
  if (giftSlug === 'surprise' && gift.hearts_min && gift.hearts_max) {
    heartsToGrant = Math.floor(
      Math.random() * (gift.hearts_max - gift.hearts_min + 1) + gift.hearts_min
    );
  }

  // 8. Create pending transaction
  const { data: tx, error: txError } = await serviceClient
    .from('gift_transactions')
    .insert({
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

  // 9. Create Creem checkout
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
      // Mark transaction as failed
      await serviceClient
        .from('gift_transactions')
        .update({ status: 'failed' })
        .eq('id', tx.id);
      throw new AppError('Payment initiation failed', 500);
    }

    const checkoutData = await checkoutRes.json();

    // Save checkout ID
    await serviceClient
      .from('gift_transactions')
      .update({ creem_checkout_id: checkoutData.id })
      .eq('id', tx.id);

    return apiSuccess({
      checkout_url: checkoutData.checkout_url,
      transaction_id: tx.id,
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error('[Gift] Checkout creation error:', err);
    await serviceClient
      .from('gift_transactions')
      .update({ status: 'failed' })
      .eq('id', tx.id);
    throw new AppError('Payment initiation failed', 500);
  }
}

export const POST = withErrorHandler(handler);
