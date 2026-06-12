import { NextRequest } from 'next/server';
import { createHash } from 'crypto';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiError, withErrorHandler, AppError } from '@/lib/api-utils';
import { checkRateLimit, type RateLimitConfig } from '@/lib/rate-limit';
import { sanitizeString, isValidEmail, isOneOf } from '@/lib/validators';
import { sendFeedbackNotification } from '@/lib/notify/feedback-email';

const CATEGORIES = ['general', 'payment', 'bug', 'other'] as const;
const MAX_MESSAGE_LEN = 5000;

// Anti-spam: 5 submissions per hour per identity (user or IP).
const FEEDBACK_RATE_LIMIT: RateLimitConfig = { maxRequests: 5, windowSeconds: 60 * 60 };

/** First client IP from x-forwarded-for, or 'unknown'. */
function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || 'unknown';
}

/** One-way hash of IP (+ app secret as salt) for abuse audit without storing raw IP. */
function hashIp(ip: string): string {
  const salt = process.env.SUPABASE_SERVICE_ROLE_KEY || 'vm-feedback-salt';
  return createHash('sha256').update(`${ip}:${salt}`).digest('hex');
}

async function handler(req: NextRequest) {
  // Resolve identity (logged-in users allowed but not required).
  let userId: string | null = null;
  try {
    const authed = await createServerSupabase();
    const {
      data: { user },
    } = await authed.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    userId = null;
  }

  const ip = clientIp(req);

  // Rate limit by user when authed, else by IP. Stops one bad actor flooding the table.
  const rlKey = userId ? `feedback:u:${userId}` : `feedback:ip:${ip}`;
  const rl = checkRateLimit(rlKey, FEEDBACK_RATE_LIMIT);
  if (!rl.allowed) {
    return apiError('Too many submissions. Please try again later.', 429);
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    throw new AppError('Invalid request body');
  }

  const message = sanitizeString(body.message).slice(0, MAX_MESSAGE_LEN);
  const categoryRaw = sanitizeString(body.category || 'general');
  const category = isOneOf(categoryRaw, CATEGORIES) ? categoryRaw : 'general';

  const contactEmail: string | null =
    sanitizeString(body.contact_email || '').toLowerCase() || null;
  if (contactEmail && !isValidEmail(contactEmail)) {
    throw new AppError('Please enter a valid email address');
  }

  if (!message || message.length < 1) {
    throw new AppError('Please enter a message');
  }

  const userAgent = sanitizeString(req.headers.get('user-agent') || '').slice(0, 500) || null;

  // Service role: RLS denies all direct client access; writes go through server only.
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from('feedback')
    .insert({
      user_id: userId,
      category,
      message,
      contact_email: contactEmail,
      ip_hash: hashIp(ip),
      user_agent: userAgent,
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('[Feedback Error]', error);
    throw new AppError('Failed to submit feedback. Please try again.', 500);
  }

  // Best-effort notification (never blocks success).
  await sendFeedbackNotification({
    id: data.id,
    category,
    message,
    contactEmail,
    userId,
  });

  return apiSuccess({ submitted: true });
}

export const POST = withErrorHandler(handler);
