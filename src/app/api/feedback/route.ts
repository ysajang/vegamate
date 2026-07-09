import { NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { apiSuccess, AppError, withErrorHandler } from '@/lib/api-utils';
import { checkRateLimit } from '@/lib/rate-limit';
import { validateFeedbackInput } from '@/lib/feedback/validate';
import { notifyFeedbackTelegram } from '@/lib/feedback/telegram';

// POST /api/feedback → store in-app feedback + notify operator (Telegram)
async function postHandler(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  // Anti-spam: 5 submissions / 10 min per user.
  const rl = checkRateLimit(`feedback:${user.id}`, {
    maxRequests: 5,
    windowSeconds: 600,
  });
  if (!rl.allowed) {
    throw new AppError('Too many feedback submissions — please try again later', 429);
  }

  const body = await req.json().catch(() => null);
  const validation = validateFeedbackInput(body);
  if (!validation.ok) {
    throw new AppError(validation.error, 400);
  }
  const { category, message, context } = validation.value;

  // Insert as the user (RLS: insert-own only).
  const { error } = await supabase.from('feedback').insert({
    user_id: user.id,
    category,
    message,
    context,
  });
  if (error) {
    console.error('[Feedback] insert failed:', error);
    throw new AppError('Failed to save feedback', 500);
  }

  // Fire-and-forget operator notification — never blocks the response result.
  await notifyFeedbackTelegram({
    category,
    message,
    userEmail: user.email ?? null,
    userId: user.id,
    path: typeof context?.path === 'string' ? context.path : null,
  });

  return apiSuccess({ received: true });
}

export const POST = withErrorHandler(postHandler);
