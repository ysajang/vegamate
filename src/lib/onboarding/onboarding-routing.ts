/**
 * Onboarding routing decisions — pure functions, framework-free, so the
 * loop-prone logic is unit-testable in isolation.
 *
 * THE BUG THIS FIXES (P0 infinite loop):
 * Onboarding completion was judged by `display_name` alone, but the real gate
 * is `age_verified_adult`. A user could end up with display_name SET and
 * birth_date NULL / age_verified_adult=false (a "zombie" state) — e.g. legacy
 * signups from before the age step existed, or reaching the final onboarding
 * step (which PATCHes display_name first) without having passed the age step.
 *
 * In that zombie state the guards ping-ponged forever:
 *   onboarding.checkProfile sees display_name -> /select
 *   /select POST /api/conversations -> 403 AGE_NOT_VERIFIED -> /onboarding
 *   onboarding.checkProfile sees display_name -> /select   (loop)
 *
 * Fix: completion = display_name AND age_verified_adult. A zombie (name but
 * unverified) must land on the AGE step — never the name step (re-entering the
 * name step is what produced the visible "bounced back to ¿Cómo debo
 * llamarte?" loop), and never /select (that bounces off the server age guard).
 */

export type OnboardingStep = 'name' | 'age' | 'character' | 'first-message';

export interface OnboardingProfileSnapshot {
  /** Trimmed display name if the name step was completed, else null/empty. */
  display_name: string | null | undefined;
  /** Server-authoritative adult flag. Only true after the age endpoint passes. */
  age_verified_adult: boolean | null | undefined;
}

/**
 * Has the user fully completed onboarding such that /select is safe?
 * Both the name AND the server age check must be satisfied. Judging on
 * display_name alone is exactly what created the loop.
 */
export function isOnboardingComplete(p: OnboardingProfileSnapshot): boolean {
  const hasName = typeof p.display_name === 'string' && p.display_name.trim().length > 0;
  return hasName && p.age_verified_adult === true;
}

/**
 * Where should a user who lands on /onboarding actually start?
 *
 * - Fully complete            -> they shouldn't be here; caller redirects to /select.
 * - Name set, NOT age-verified -> jump straight to the AGE step (skip name).
 *   This is the zombie-recovery path that breaks the loop.
 * - Otherwise (no name)        -> start at the NAME step (step 0).
 *
 * Returns null when onboarding is already complete (signal: go to /select).
 */
export function resolveInitialOnboardingStep(
  p: OnboardingProfileSnapshot
): OnboardingStep | null {
  if (isOnboardingComplete(p)) return null;

  const hasName = typeof p.display_name === 'string' && p.display_name.trim().length > 0;
  if (hasName && p.age_verified_adult !== true) {
    // Zombie: name exists but unverified -> recover at the age gate.
    return 'age';
  }
  return 'name';
}

/** Map an OnboardingStep to the numeric step index used by the page state. */
export function stepToIndex(step: OnboardingStep): number {
  switch (step) {
    case 'name':
      return 0;
    case 'age':
      return 1;
    case 'character':
      return 2;
    case 'first-message':
      return 3;
  }
}

/**
 * The conversation/age guard returned AGE_NOT_VERIFIED at the final step.
 * Decide what the onboarding UI should do. We must NOT silently stop
 * (the old behavior = frozen spinner) and must NOT restart at the name step
 * (= the visible loop). Always recover at the age step.
 */
export function recoverStepOnAgeBlocked(): OnboardingStep {
  return 'age';
}

/** Is this API error payload the server age gate rejecting the user? */
export function isAgeNotVerified(payload: {
  code?: string;
  success?: boolean;
}): boolean {
  return payload?.success === false && payload?.code === 'AGE_NOT_VERIFIED';
}
