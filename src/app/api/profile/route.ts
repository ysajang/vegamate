import { NextRequest } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiError, withErrorHandler, AppError } from '@/lib/api-utils';
import { sanitizeString } from '@/lib/validators';
import { SUPPORTED_PREFERRED_LANGUAGES } from '@/lib/onboarding/browser-language';

// GET /api/profile -> get current user profile
async function getHandler() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error || !profile) {
    // Profile might not exist yet (new user before trigger fires)
    return apiSuccess(null);
  }

  return apiSuccess(profile);
}

// PATCH /api/profile -> update profile fields
async function patchHandler(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    throw new AppError('Invalid request body');
  }

  // Whitelist allowed fields
  const updates: Record<string, unknown> = {};

  if ('display_name' in body) {
    const name = sanitizeString(body.display_name);
    if (name && name.length > 30) {
      throw new AppError('Display name too long (max 30 characters)');
    }
    updates.display_name = name || null;
  }

  if ('user_gender' in body) {
    const gender = sanitizeString(body.user_gender);
    if (gender && !['male', 'female', 'other'].includes(gender)) {
      throw new AppError('Invalid gender value');
    }
    updates.user_gender = gender || null;
  }

  if ('preferred_language' in body) {
    // Greeting/proactive language source. Strict whitelist — mirrors
    // language-directive's supported set; anything else is rejected so a
    // crafted value can never reach the prompt path.
    const lang = sanitizeString(body.preferred_language);
    if (
      lang &&
      (SUPPORTED_PREFERRED_LANGUAGES as readonly string[]).includes(lang)
    ) {
      updates.preferred_language = lang;
    }
  }

  if ('timezone' in body) {
    const tz = sanitizeString(body.timezone);
    if (tz) {
      // Validate timezone string
      try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
        updates.timezone = tz;
      } catch {
        // Invalid timezone -> ignore silently
      }
    }
  }

  if (Object.keys(updates).length === 0) {
    return apiError('No valid fields to update');
  }

  updates.updated_at = new Date().toISOString();

  const serviceClient = createServiceRoleClient();
  const { data: updated, error } = await serviceClient
    .from('profiles')
    .update(updates)
    .eq('id', user.id)
    .select()
    .single();

  if (error) {
    console.error('[Profile] Update error:', error);
    throw new AppError('Failed to update profile', 500);
  }

  return apiSuccess(updated);
}

export const GET = withErrorHandler(getHandler);
export const PATCH = withErrorHandler(patchHandler);
