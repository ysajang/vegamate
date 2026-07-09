import { describe, it, expect } from 'vitest';
import { parseGiftMarker } from './gift-parser';

describe('parseGiftMarker', () => {
  it('extracts a known slug and strips the marker', () => {
    const r = parseGiftMarker('커피 마시고 싶다 [GIFT:coffee]');
    expect(r).not.toBeNull();
    expect(r!.giftSlug).toBe('coffee');
    expect(r!.cleanContent).toBe('커피 마시고 싶다');
  });

  it('returns null when no marker exists', () => {
    expect(parseGiftMarker('오늘 뭐해?')).toBe(null);
  });

  it('PROD BUG: unknown slug still STRIPS the marker from visible text', () => {
    // Screenshot 2026-07-09: "[GIFT:milltea]" rendered raw inside the bubble.
    const r = parseGiftMarker('아니야 괜찮아 ㅋㅋ 한국말로 편하게 해도 돼.\n\n뭐 하고 있어?\n\n[GIFT:milltea]');
    expect(r).not.toBeNull();
    expect(r!.cleanContent).not.toMatch(/\[GIFT/i);
    expect(r!.cleanContent).toContain('뭐 하고 있어?');
  });

  it('recovers an obvious one-character typo to the intended slug (milltea → milktea)', () => {
    const r = parseGiftMarker('밀크티 사줘 [GIFT:milltea]');
    expect(r!.giftSlug).toBe('milktea');
  });

  it('unrecoverable unknown slug → giftSlug null (fallback pool decides), marker still stripped', () => {
    const r = parseGiftMarker('hey [GIFT:spaceship]');
    expect(r!.giftSlug).toBe(null);
    expect(r!.cleanContent).toBe('hey');
  });

  it('normalizes case / spaces / hyphens in the slug', () => {
    expect(parseGiftMarker('x [GIFT: Milk Tea ]')!.giftSlug).toBe('milktea');
    expect(parseGiftMarker('x [GIFT:milk-tea]')!.giftSlug).toBe('milktea');
    expect(parseGiftMarker('x [gift:COFFEE]')!.giftSlug).toBe('coffee');
  });

  it('strips ALL gift-shaped markers, not just the first', () => {
    const r = parseGiftMarker('a [GIFT:coffee] b [GIFT:junk] c');
    expect(r!.giftSlug).toBe('coffee');
    expect(r!.cleanContent).not.toMatch(/\[GIFT/i);
    expect(r!.cleanContent.replace(/\s+/g, ' ')).toBe('a b c');
  });
});
