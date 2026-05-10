import { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiError, withErrorHandler, AppError } from '@/lib/api-utils';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { isValidEmail, sanitizeString } from '@/lib/validators';

async function handler(req: NextRequest) {
  // Rate limit by IP
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || 'unknown';
  const rl = checkRateLimit(`preregister:${ip}`, RATE_LIMITS.preregister);

  if (!rl.allowed) {
    return apiError('Too many requests. Please try again later.', 429);
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    throw new AppError('Invalid request body');
  }

  const email = sanitizeString(body.email).toLowerCase();
  const willingToPay = body.willing_to_pay === true;
  const source = sanitizeString(body.source || '') || null;

  if (!email || !isValidEmail(email)) {
    throw new AppError('Please enter a valid email address');
  }

  const supabase = createServiceRoleClient();

  const { error } = await supabase.from('preregistrations').upsert(
    {
      email,
      willing_to_pay: willingToPay,
      source,
    },
    { onConflict: 'email' }
  );

  if (error) {
    console.error('[Preregistration Error]', error);
    throw new AppError('Failed to register. Please try again.', 500);
  }

  return apiSuccess({ registered: true });
}

export const POST = withErrorHandler(handler);
