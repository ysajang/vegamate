/**
 * Selfie tier gating (round 1.5) — connects the proven payment motive
 * (suggestive content; 3 of 4 ad users asked explicitly, section 34) to the
 * product WITHOUT selling explicit content (PayPal/Meta ceiling, P0-c line).
 *
 * Chat-time pool access (what the [SELFIE:scene] path may pick from):
 *   free       → everyone
 *   premium_b  → Lover subscription active OR intimacy at max stage (devoted)
 *   premium_a  → Lover subscription active
 *   premium_s  → Lover active AND max stage (double gate — the "가장 아끼는 것"
 *                narrative: money alone can't buy it, closeness alone can't)
 *
 * One-shot gift thank-you (Lover isn't sellable yet — the doc's fallback,
 * implemented as an automatic reward so the loop is real today):
 *   $4.99+  → one premium_b selfie   (flowers / plushie / surprise)
 *   $9.99+  → one premium_a selfie   (airpods / clothes)
 *   $14.99+ → one premium_s selfie   (dinner / ring)
 * Deviation from the doc noted in the report: the doc floats "$9.99+ for
 * premium_a/s"; we ladder s up to $14.99+ so the top tier keeps scarcity and
 * ring($29.99)/dinner($14.99) keep a reason to exist.
 * Delivery rides sendGiftReaction, which is already idempotent per gift tx.
 */

export const SELFIE_TIERS = ['free', 'premium_b', 'premium_a', 'premium_s'] as const;
export type SelfieTier = (typeof SELFIE_TIERS)[number];

/** Mirrors intimacy_stage_for_score(): 4 = devoted (350+). */
export const MAX_INTIMACY_STAGE = 4;

export interface TierAccessInput {
  /** Any active subscription counts as Lover (single-plan design, section 6). */
  hasActiveLover: boolean;
  intimacyStage: number;
}

/** Tiers this user's chat selfie picks may draw from, in ascending order. */
export function resolveAllowedTiers(u: TierAccessInput): SelfieTier[] {
  const tiers: SelfieTier[] = ['free'];
  const maxStage = u.intimacyStage >= MAX_INTIMACY_STAGE;
  if (u.hasActiveLover || maxStage) tiers.push('premium_b');
  if (u.hasActiveLover) tiers.push('premium_a');
  if (u.hasActiveLover && maxStage) tiers.push('premium_s');
  return tiers;
}

export function canAccessTier(u: TierAccessInput, tier: SelfieTier): boolean {
  return resolveAllowedTiers(u).includes(tier);
}

/** Threshold ladder for the one-shot gift thank-you selfie (epsilon for float noise). */
const EPS = 0.01;

export function thankYouTierForAmount(amountUsd: number | null | undefined): SelfieTier | null {
  if (typeof amountUsd !== 'number' || !Number.isFinite(amountUsd)) return null;
  if (amountUsd >= 14.99 - EPS) return 'premium_s';
  if (amountUsd >= 9.99 - EPS) return 'premium_a';
  if (amountUsd >= 4.99 - EPS) return 'premium_b';
  return null;
}
