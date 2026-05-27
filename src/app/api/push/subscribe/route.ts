import { NextRequest } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiError, withErrorHandler, AppError } from '@/lib/api-utils';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { sanitizeString } from '@/lib/validators';

// POST /api/push/subscribe -> register push subscription
async function postHandler(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  // Rate limit
  const rl = checkRateLimit(`push-sub:${user.id}`, RATE_LIMITS.api);
  if (!rl.allowed) {
    return apiError('Too many requests', 429);
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    throw new AppError('Invalid request body');
  }

  const endpoint = sanitizeString(body.endpoint);
  const p256dh = sanitizeString(body.p256dh);
  const auth = sanitizeString(body.auth);

  if (!endpoint || !p256dh || !auth) {
    throw new AppError('Missing subscription fields (endpoint, p256dh, auth)');
  }

  // Basic URL validation for endpoint
  try {
    new URL(endpoint);
  } catch {
    throw new AppError('Invalid endpoint URL');
  }

  const userAgent = sanitizeString(
    req.headers.get('user-agent') || ''
  ).slice(0, 500);

  const serviceClient = createServiceRoleClient();

  // Upsert by endpoint (unique constraint)
  const { data, error } = await serviceClient
    .from('push_subscriptions')
    .upsert(
      {
        user_id: user.id,
        endpoint,
        p256dh,
        auth,
        user_agent: userAgent || null,
        is_active: true,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' }
    )
    .select()
    .single();

  if (error) {
    console.error('[Push] Subscribe error:', error);
    throw new AppError('Failed to save subscription', 500);
  }

  return apiSuccess({ id: data.id, subscribed: true });
}

// DELETE /api/push/subscribe -> unregister push subscription
async function deleteHandler(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const body = await req.json().catch(() => null);
  const endpoint = body ? sanitizeString(body.endpoint) : '';

  if (!endpoint) {
    throw new AppError('Missing endpoint');
  }

  const serviceClient = createServiceRoleClient();

  // Soft-delete: deactivate rather than remove
  await serviceClient
    .from('push_subscriptions')
    .update({ is_active: false })
    .eq('user_id', user.id)
    .eq('endpoint', endpoint);

  return apiSuccess({ unsubscribed: true });
}

export const POST = withErrorHandler(postHandler);
export const DELETE = withErrorHandler(deleteHandler);
