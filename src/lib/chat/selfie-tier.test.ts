import { describe, it, expect } from 'vitest';
import {
  resolveAllowedTiers,
  canAccessTier,
  thankYouTierForAmount,
  MAX_INTIMACY_STAGE,
} from './selfie-tier';

// Round 1.5 gating (doc 2026-07-11). Chat-time pool access:
//   free       → everyone
//   premium_b  → Lover active OR intimacy max stage (devoted, 4)
//   premium_a  → Lover active only
//   premium_s  → Lover active AND max stage (double gate — "가장 아끼는 것")
// One-shot gift thank-you rights (Lover not sellable yet — fallback):
//   $4.99+ → premium_b, $9.99+ → premium_a, $14.99+ → premium_s

describe('resolveAllowedTiers — chat-time selfie pool access', () => {
  it('anonymous baseline: free only', () => {
    expect(resolveAllowedTiers({ hasActiveLover: false, intimacyStage: 0 })).toEqual(['free']);
  });

  it('max intimacy without subscription unlocks premium_b only', () => {
    expect(
      resolveAllowedTiers({ hasActiveLover: false, intimacyStage: MAX_INTIMACY_STAGE })
    ).toEqual(['free', 'premium_b']);
  });

  it('stage just below max unlocks nothing', () => {
    expect(
      resolveAllowedTiers({ hasActiveLover: false, intimacyStage: MAX_INTIMACY_STAGE - 1 })
    ).toEqual(['free']);
  });

  it('Lover active (low stage): free + b + a, but NOT s (double gate)', () => {
    expect(resolveAllowedTiers({ hasActiveLover: true, intimacyStage: 1 })).toEqual([
      'free',
      'premium_b',
      'premium_a',
    ]);
  });

  it('Lover active AND max stage: everything including premium_s', () => {
    expect(
      resolveAllowedTiers({ hasActiveLover: true, intimacyStage: MAX_INTIMACY_STAGE })
    ).toEqual(['free', 'premium_b', 'premium_a', 'premium_s']);
  });

  it('canAccessTier agrees with resolveAllowedTiers', () => {
    const u = { hasActiveLover: true, intimacyStage: 2 };
    expect(canAccessTier(u, 'free')).toBe(true);
    expect(canAccessTier(u, 'premium_b')).toBe(true);
    expect(canAccessTier(u, 'premium_a')).toBe(true);
    expect(canAccessTier(u, 'premium_s')).toBe(false);
  });
});

describe('thankYouTierForAmount — one-shot gift reward (Lover fallback)', () => {
  it('maps price ladders to tiers', () => {
    expect(thankYouTierForAmount(4.99)).toBe('premium_b');   // flowers/plushie/surprise
    expect(thankYouTierForAmount(9.99)).toBe('premium_a');   // airpods/clothes
    expect(thankYouTierForAmount(14.99)).toBe('premium_s');  // dinner
    expect(thankYouTierForAmount(29.99)).toBe('premium_s');  // ring
  });

  it('below $4.99 earns no premium thank-you', () => {
    expect(thankYouTierForAmount(0.99)).toBe(null);
    expect(thankYouTierForAmount(2.99)).toBe(null);
  });

  it('handles junk input safely', () => {
    expect(thankYouTierForAmount(NaN)).toBe(null);
    expect(thankYouTierForAmount(undefined)).toBe(null);
    expect(thankYouTierForAmount(-5)).toBe(null);
  });

  it('float noise around the threshold still qualifies (4.99 as 4.989999…)', () => {
    expect(thankYouTierForAmount(4.989999999)).toBe('premium_b');
  });
});
