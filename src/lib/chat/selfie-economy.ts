/**
 * Selfie-economy pivot (round 2, 2026-07-13).
 *
 * Photos are the product's differentiator and the highest willingness-to-pay
 * moment — and they were free. Category evidence (2026): market leaders gate
 * images per-item behind payment and keep free tiers text-only; VegaMate's
 * measured funnel with everything free produced 0 payments. New economy:
 *
 * - The FIRST selfie a user ever receives lands unblurred (the "wow" hook).
 * - Every later selfie arrives as a blurred card ("너한테만 보여줄까…") that a
 *   gift unlocks — free-tier photos from $1.99, premium tiers keep $4.99+.
 * - Lover subscribers get everything unblurred (the subscription's promise).
 * - A selfie the user already owns is never re-locked.
 * - Missing blur asset → deliver unblurred (graceful until backfill).
 *
 * Copy stays relationship-framed only (BANNED_SALES_WORDS audit) — PayPal is
 * the single payment rail and must never see sexualized sales language.
 */

export type SelfieDelivery = 'unblurred' | 'blurred';

export interface SelfieDeliveryInput {
  /** True when the user has never collected any selfie (lifetime, any character). */
  isFirstSelfieEver: boolean;
  /** Active Lover subscription — everything arrives unblurred. */
  isLoverSubscriber: boolean;
  /** This exact selfie is already in the user's collection. */
  alreadyOwned: boolean;
  /** Pre-generated blurred asset URL; absent → cannot blur, deliver normally. */
  blurredUrl: string | null | undefined;
}

export function decideSelfieDelivery(input: SelfieDeliveryInput): SelfieDelivery {
  if (input.isLoverSubscriber) return 'unblurred';
  if (input.alreadyOwned) return 'unblurred';
  if (input.isFirstSelfieEver) return 'unblurred';
  if (!input.blurredUrl) return 'unblurred';
  return 'blurred';
}

/**
 * Minimum gift amount that unlocks a blurred card of the given tier.
 * Free-tier photos open at $1.99 (cake) — the lowest observed purchase
 * intent in prod was $0.99, so the first-payment barrier stays low.
 * Premium tiers keep the $4.99 floor so the ladder (flowers → dinner →
 * ring) stays intact.
 */
export function minGiftUsdForTier(tier: string | null | undefined): number {
  if (tier === 'premium_b' || tier === 'premium_a' || tier === 'premium_s') return 4.99;
  return 1.99;
}

/**
 * Card copy for a blurred REGULAR selfie (distinct from the explicit-request
 * teaser copy — this is playful push-pull, not a refusal pairing).
 */
export const SELFIE_BLUR_COPY = {
  en: {
    caption: 'took this for you… should I really show you? 😳',
    cta: 'Send a gift to see it',
  },
  ko: {
    caption: '너 주려고 찍었는데… 진짜 보여줘도 되나? 😳',
    cta: '선물 보내고 보기',
  },
} as const;
