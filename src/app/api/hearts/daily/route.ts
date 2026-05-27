import { NextRequest } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiError, withErrorHandler, AppError } from '@/lib/api-utils';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import type { ClaimDailyHeartsResult } from '@/types';

async function handler(req: NextRequest) {
  // 1. Auth check
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  // 2. Rate limit (prevent abuse)
  const rl = checkRateLimit(`hearts-daily:${user.id}`, RATE_LIMITS.api);
  if (!rl.allowed) {
    return apiError('Too many requests', 429);
  }

  // 3. Call RPC
  const serviceClient = createServiceRoleClient();
  const { data, error } = await serviceClient.rpc('claim_daily_hearts', {
    p_user_id: user.id,
  });

  if (error) {
    console.error('[Hearts] claim_daily_hearts failed:', error);
    throw new AppError('Failed to claim daily hearts', 500);
  }

  const result = data as ClaimDailyHeartsResult;

  return apiSuccess(result);
}

export const POST = withErrorHandler(handler);
