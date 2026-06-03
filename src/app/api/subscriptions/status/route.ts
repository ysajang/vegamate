import { NextRequest } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, withErrorHandler, AppError } from '@/lib/api-utils';
import { isValidUUID } from '@/lib/validators';

/**
 * Poll a subscription row's status (used by /payment/return while waiting for
 * the BILLING.SUBSCRIPTION.ACTIVATED webhook to land). Owner-only.
 */
async function handler(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const subId = req.nextUrl.searchParams.get('sub');
  if (!subId || !isValidUUID(subId)) {
    throw new AppError('Invalid sub id');
  }

  const serviceClient = createServiceRoleClient();
  const { data: sub } = await serviceClient
    .from('subscriptions')
    .select('id, status, user_id')
    .eq('id', subId)
    .single();

  if (!sub || sub.user_id !== user.id) {
    throw new AppError('Not found', 404);
  }

  return apiSuccess({ status: sub.status });
}

export const GET = withErrorHandler(handler);
