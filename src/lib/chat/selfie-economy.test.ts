import { describe, it, expect } from 'vitest';
import {
  decideSelfieDelivery,
  minGiftUsdForTier,
  SELFIE_BLUR_COPY,
} from './selfie-economy';
import { BANNED_SALES_WORDS } from './blur-teaser';

/**
 * Selfie-economy pivot (round 2, 2026-07-13).
 *
 * Market evidence: category leaders lock photos behind payment (per-image
 * token pricing, zero images on free tiers) and convert on the photo-desire
 * moment; VegaMate was giving its differentiator away free — measured
 * result: 0 payments. New rule: the FIRST selfie ever lands unblurred (the
 * "wow" hook), every later selfie arrives as a blurred card unlocked by a
 * gift. Lover subscribers and already-owned selfies stay unblurred.
 */
describe('decideSelfieDelivery', () => {
  const base = {
    isFirstSelfieEver: false,
    isLoverSubscriber: false,
    alreadyOwned: false,
    blurredUrl: 'https://x/blur.webp',
  };

  it('first selfie ever → unblurred (the hook is sacred)', () => {
    expect(decideSelfieDelivery({ ...base, isFirstSelfieEver: true })).toBe('unblurred');
  });

  it('Lover subscriber → always unblurred (the upsell promise)', () => {
    expect(decideSelfieDelivery({ ...base, isLoverSubscriber: true })).toBe('unblurred');
  });

  it('already-owned selfie → unblurred (never re-lock what they unlocked)', () => {
    expect(decideSelfieDelivery({ ...base, alreadyOwned: true })).toBe('unblurred');
  });

  it('no blurred asset yet → unblurred (graceful until backfill completes)', () => {
    expect(decideSelfieDelivery({ ...base, blurredUrl: null })).toBe('unblurred');
    expect(decideSelfieDelivery({ ...base, blurredUrl: '' })).toBe('unblurred');
  });

  it('second+ selfie, free user, asset ready → blurred (the new default)', () => {
    expect(decideSelfieDelivery(base)).toBe('blurred');
  });
});

describe('minGiftUsdForTier', () => {
  it('free tier unlocks from $1.99 (low first-payment barrier — Greg tried $0.99)', () => {
    expect(minGiftUsdForTier('free')).toBe(1.99);
    expect(minGiftUsdForTier(null)).toBe(1.99);
    expect(minGiftUsdForTier(undefined)).toBe(1.99);
  });

  it('premium tiers keep the $4.99 floor (ladder intact)', () => {
    expect(minGiftUsdForTier('premium_b')).toBe(4.99);
    expect(minGiftUsdForTier('premium_a')).toBe(4.99);
    expect(minGiftUsdForTier('premium_s')).toBe(4.99);
  });
});

describe('SELFIE_BLUR_COPY — payment-rail defense', () => {
  it('contains no banned sales words (PayPal is the only rail)', () => {
    for (const lang of Object.values(SELFIE_BLUR_COPY)) {
      const text = `${lang.caption} ${lang.cta}`.toLowerCase();
      for (const word of BANNED_SALES_WORDS) {
        expect(text.includes(word.toLowerCase())).toBe(false);
      }
    }
  });

  it('has en and ko variants with caption + cta', () => {
    expect(SELFIE_BLUR_COPY.en.caption.length).toBeGreaterThan(0);
    expect(SELFIE_BLUR_COPY.en.cta.length).toBeGreaterThan(0);
    expect(SELFIE_BLUR_COPY.ko.caption.length).toBeGreaterThan(0);
    expect(SELFIE_BLUR_COPY.ko.cta.length).toBeGreaterThan(0);
  });
});
