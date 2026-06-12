import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '@/lib/api-utils';

/**
 * Server-side age gate, enforced at the data-access layer.
 *
 * Why here and not only in middleware/proxy: CVE-2025-29927 showed middleware
 * auth can be bypassed via a forged x-middleware-subrequest header, so the
 * canonical Next.js pattern is to verify at every data access point. The age
 * gate is a legal/safety control (no minors in an AI-companion product), so it
 * must hold even if a user reaches an API route directly — by deep link, by
 * typing the URL, or by skipping the onboarding UI. The client onboarding flow
 * is UX, not enforcement; this is enforcement.
 *
 * age_verified_adult is written only by the service-role age endpoint after a
 * server-side adult check, and is excluded from the profile PATCH whitelist,
 * so the client cannot set it. Reading it here is the authoritative check.
 *
 * Throws AppError(403, 'AGE_NOT_VERIFIED') when the user has not passed the
 * adult age check. Callers let withErrorHandler translate it to a 403 the
 * client maps to the onboarding/age step.
 */
export async function assertAgeVerified(
  serviceClient: SupabaseClient,
  userId: string
): Promise<void> {
  const { data, error } = await serviceClient
    .from('profiles')
    .select('age_verified_adult')
    .eq('id', userId)
    .single();

  if (error) {
    // Fail closed: if we cannot confirm adulthood, do not grant access.
    console.error('[AgeGuard] profile lookup failed:', error.message);
    throw new AppError('Age verification required', 403, 'AGE_NOT_VERIFIED');
  }

  if (data?.age_verified_adult !== true) {
    throw new AppError('Age verification required', 403, 'AGE_NOT_VERIFIED');
  }
}
