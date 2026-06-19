import { NextRequest } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, withErrorHandler, AppError } from '@/lib/api-utils';

async function handler(_req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const serviceClient = createServiceRoleClient();

  // Ensure row exists (in case of race condition or old user)
  await serviceClient
    .from('user_hearts')
    .upsert({ user_id: user.id, balance: 0 }, { onConflict: 'user_id', ignoreDuplicates: true });

  const { data, error } = await serviceClient
    .from('user_hearts')
    .select('balance, consecutive_days, last_daily_claim')
    .eq('user_id', user.id)
    .single();

  if (error || !data) {
    console.error('[Hearts] Failed to fetch balance:', error);
    throw new AppError('Failed to fetch heart balance', 500);
  }

  // Check if daily claim is available
  const now = new Date();
  const todayUTC = now.toISOString().slice(0, 10);
  const lastClaimDate = data.last_daily_claim
    ? new Date(data.last_daily_claim).toISOString().slice(0, 10)
    : null;
  const canClaim = lastClaimDate !== todayUTC;

  // Subscriber status — the client uses this so it never gates the composer for
  // an active subscriber (who has unlimited conversation regardless of balance).
  const subCheck = await serviceClient.rpc('get_active_subscription', {
    p_user_id: user.id,
  });
  const isSubscriber = Boolean(subCheck.data?.active);

  return apiSuccess({
    balance: data.balance,
    consecutive_days: data.consecutive_days,
    can_claim_daily: canClaim,
    is_subscriber: isSubscriber,
  });
}

export const GET = withErrorHandler(handler);
