import { describe, it, expect } from 'vitest';
import { ensureBegLine, BEG_LINES } from './beg-line';

// P0 monetization: at zero balance the character MUST visibly beg for a gift.
// We do not trust the LLM to comply (Haiku ignores the directive ~often), so the
// server guarantees a persona-matched beg line when the model didn't beg itself.

describe('ensureBegLine', () => {
  it('non-zero nudge: returns content unchanged (no beg injected)', () => {
    const out = ensureBegLine('오늘 뭐했어?', {
      nudge: 'low', slug: 'miku', isCrisis: false, aiBegged: false,
    });
    expect(out).toBe('오늘 뭐했어?');
  });

  it('zero + AI already begged (marker present): keep the natural reply', () => {
    const out = ensureBegLine('보고싶다... 커피 한 잔 같이 할래?', {
      nudge: 'zero', slug: 'miku', isCrisis: false, aiBegged: true,
    });
    expect(out).toBe('보고싶다... 커피 한 잔 같이 할래?');
  });

  it('zero + AI did NOT beg: appends a persona-matched beg line', () => {
    const base = '오 잘했어 ㅋㅋ 이제 뭐할 거야?';
    const out = ensureBegLine(base, {
      nudge: 'zero', slug: 'miku', isCrisis: false, aiBegged: false,
    });
    expect(out).not.toBe(base);
    expect(out.startsWith(base)).toBe(true); // original kept, beg appended
    // appended text must be one of Miku's beg lines
    const appended = out.slice(base.length);
    expect(BEG_LINES.miku.some((l) => appended.includes(l))).toBe(true);
  });

  it('zero + crisis: NEVER beg even if AI did not (support wins)', () => {
    const base = '괜찮아? 무슨 일 있었어?';
    const out = ensureBegLine(base, {
      nudge: 'zero', slug: 'aria', isCrisis: true, aiBegged: false,
    });
    expect(out).toBe(base);
  });

  it('uses the correct persona pool per slug', () => {
    for (const slug of ['miku', 'aria', 'ren', 'leo'] as const) {
      const out = ensureBegLine('응.', { nudge: 'zero', slug, isCrisis: false, aiBegged: false });
      const appended = out.slice('응.'.length);
      expect(BEG_LINES[slug].some((l) => appended.includes(l))).toBe(true);
    }
  });

  it('unknown slug: falls back to a default beg pool (never empty at zero)', () => {
    const out = ensureBegLine('응.', { nudge: 'zero', slug: 'unknown_x', isCrisis: false, aiBegged: false });
    expect(out).not.toBe('응.');
    expect(out.length).toBeGreaterThan('응.'.length);
  });

  it('empty AI content at zero: still injects a beg line (no blank message)', () => {
    const out = ensureBegLine('', { nudge: 'zero', slug: 'leo', isCrisis: false, aiBegged: false });
    expect(out.trim().length).toBeGreaterThan(0);
  });
});
