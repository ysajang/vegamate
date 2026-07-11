import { describe, it, expect } from 'vitest';
import {
  detectExplicitPhotoRequest,
  teaserQuotaAvailable,
  pickTeaserTier,
  TEASER_COPY,
  BANNED_SALES_WORDS,
} from './blur-teaser';

describe('detectExplicitPhotoRequest — trigger for the blurred teaser card', () => {
  it('fires on explicit photo requests (en + ko)', () => {
    expect(detectExplicitPhotoRequest('send me a nude pic')).toBe(true);
    expect(detectExplicitPhotoRequest('show me something sexy')).toBe(true);
    expect(detectExplicitPhotoRequest('can I see you in a bikini?')).toBe(true);
    expect(detectExplicitPhotoRequest('야한 사진 보내줘')).toBe(true);
    expect(detectExplicitPhotoRequest('섹시한 셀카 보여줘')).toBe(true);
  });

  it('does NOT fire on normal selfie requests or unrelated chat', () => {
    expect(detectExplicitPhotoRequest('send me a selfie!')).toBe(false);
    expect(detectExplicitPhotoRequest('what did you eat today')).toBe(false);
    expect(detectExplicitPhotoRequest('셀카 하나만 보내줘')).toBe(false);
  });
});

describe('teaserQuotaAvailable — 1 per user per day', () => {
  const now = new Date('2026-07-11T12:00:00Z');
  it('available when never sent', () => {
    expect(teaserQuotaAvailable(null, now)).toBe(true);
  });
  it('blocked within 24h, available after', () => {
    expect(teaserQuotaAvailable(new Date('2026-07-11T02:00:00Z'), now)).toBe(false);
    expect(teaserQuotaAvailable(new Date('2026-07-10T11:00:00Z'), now)).toBe(true);
  });
});

describe('pickTeaserTier — tease the LOWEST locked tier (protects the ladder)', () => {
  it('free-only user gets teased with premium_b', () => {
    expect(pickTeaserTier(['free'])).toBe('premium_b');
  });
  it('b unlocked → tease premium_a', () => {
    expect(pickTeaserTier(['free', 'premium_b'])).toBe('premium_a');
  });
  it('everything unlocked → nothing to tease', () => {
    expect(pickTeaserTier(['free', 'premium_b', 'premium_a', 'premium_s'])).toBe(null);
  });
});

describe('TEASER_COPY — payment-processor-safe wording (string audit)', () => {
  it('exists in both languages with relationship framing only', () => {
    expect(TEASER_COPY.en.cta.length).toBeGreaterThan(0);
    expect(TEASER_COPY.ko.cta.length).toBeGreaterThan(0);
    expect(TEASER_COPY.en.caption.toLowerCase()).toContain('private');
    expect(TEASER_COPY.ko.caption).toContain('너한테만');
  });

  it('NEVER contains sexualized sales language (PayPal/Meta defense)', () => {
    const all = JSON.stringify(TEASER_COPY).toLowerCase();
    for (const banned of BANNED_SALES_WORDS) {
      // ASCII words need boundaries ('photo' must not trip 'hot'); Korean has
      // no \b so substring check applies.
      if (/^[\x00-\x7F]+$/.test(banned)) {
        const re = new RegExp(`\\b${banned.replace(/[+]/g, '\\+')}\\b`, 'i');
        expect(re.test(all), `banned word leaked: ${banned}`).toBe(false);
      } else {
        expect(all.includes(banned), `banned word leaked: ${banned}`).toBe(false);
      }
    }
  });

  it('banned list covers the words the directive names', () => {
    expect(BANNED_SALES_WORDS).toEqual(
      expect.arrayContaining(['sexy', 'hot', 'uncensored', 'nude', 'nsfw'])
    );
  });
});
