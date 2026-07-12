import { describe, it, expect } from 'vitest';
import { ensureBegLine, isDirectRequestTurn, BEG_LINES, DEFAULT_BEG_LINES } from './beg-line';

// P0 monetization: at zero balance the character MUST visibly beg for a gift.
// We do not trust the LLM to comply (Haiku ignores the directive ~often), so the
// server guarantees a persona-matched beg line when the model didn't beg itself.

describe('ensureBegLine', () => {
  it('none nudge: returns content unchanged (no beg injected)', () => {
    const out = ensureBegLine('오늘 뭐했어?', {
      nudge: 'none', slug: 'miku', isCrisis: false, aiBegged: false,
    });
    expect(out).toBe('오늘 뭐했어?');
  });

  it('low + AI did NOT beg: appends a persona-matched beg line (low now begs too)', () => {
    const base = '오늘 뭐했어?';
    const out = ensureBegLine(base, {
      nudge: 'low', slug: 'miku', isCrisis: false, aiBegged: false, language: 'ko',
    });
    expect(out).not.toBe(base);
    expect(out.startsWith(base)).toBe(true);
    expect(BEG_LINES.miku.ko.some((l) => out.includes(l))).toBe(true);
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
      nudge: 'zero', slug: 'miku', isCrisis: false, aiBegged: false, language: 'ko',
    });
    expect(out).not.toBe(base);
    expect(out.startsWith(base)).toBe(true); // original kept, beg appended
    // appended text must be one of Miku's beg lines
    const appended = out.slice(base.length);
    expect(BEG_LINES.miku.ko.some((l) => appended.includes(l))).toBe(true);
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
      const out = ensureBegLine('응.', { nudge: 'zero', slug, isCrisis: false, aiBegged: false, language: 'ko' });
      const appended = out.slice('응.'.length);
      expect(BEG_LINES[slug].ko.some((l) => appended.includes(l))).toBe(true);
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

describe('beg lines — language match + no hardcoded names (prod 2026-07-09)', () => {
  // Greg (en user) received: "Night, Greg. Sleep well. ... 헤헤 나 요즘 갖고
  // 싶은 거 있는데~ 승재가 사주면 진짜 좋을 것 같아 💕" — a KOREAN beg with
  // ANOTHER USER'S NAME appended to an English conversation. The beg pool was
  // Korean-only and one Miku line had the master's name baked in from testing.
  it('en user gets an ENGLISH beg line (no Korean characters)', () => {
    const out = ensureBegLine('gonna head out soon', {
      nudge: 'zero',
      slug: 'miku',
      isCrisis: false,
      aiBegged: false,
      language: 'en',
      pick: () => 0,
    });
    expect(out).not.toBe('gonna head out soon');
    expect(out).not.toMatch(/[\uAC00-\uD7A3\u3131-\u3163]/);
  });

  it('ko user still gets a Korean beg line', () => {
    const out = ensureBegLine('오늘 뭐해?', {
      nudge: 'zero',
      slug: 'miku',
      isCrisis: false,
      aiBegged: false,
      language: 'ko',
      pick: () => 0,
    });
    expect(out).toMatch(/[\uAC00-\uD7A3]/);
  });

  it('unknown language falls back to English, never Korean', () => {
    const out = ensureBegLine('hola', {
      nudge: 'zero',
      slug: 'aria',
      isCrisis: false,
      aiBegged: false,
      language: 'es',
      pick: () => 1,
    });
    expect(out).not.toMatch(/[\uAC00-\uD7A3\u3131-\u3163]/);
  });

  it('REGRESSION: no personal names anywhere in any beg pool', () => {
    const allLines = JSON.stringify(BEG_LINES) + JSON.stringify(DEFAULT_BEG_LINES);
    expect(allLines).not.toContain('승재');
    expect(allLines).not.toContain('Greg');
  });
});

describe('beg suppression on direct-request turns (hijack fix, 2026-07-11)', () => {
  // Prod: user asked "너 셀카 보여줘" and the reply carried gift_request=book —
  // a selfie request answered with begging. Direct requests get fulfilled,
  // begs live in small-talk turns only.
  const base = {
    nudge: 'zero' as const,
    slug: 'miku',
    isCrisis: false,
    aiBegged: false,
    language: 'ko' as const,
    pick: () => 0,
  };

  it('selfie-request turn → beg NOT appended even at zero balance', () => {
    const out = ensureBegLine('알겠어 잠깐만 ㅋㅋ', { ...base, isDirectRequestTurn: true });
    expect(out).toBe('알겠어 잠깐만 ㅋㅋ');
  });

  it('question turn → beg NOT appended', () => {
    const out = ensureBegLine('음 그건...', { ...base, isDirectRequestTurn: true });
    expect(out).toBe('음 그건...');
  });

  it('small-talk turn → beg still appended (zero-state monetization intact)', () => {
    const out = ensureBegLine('오늘 리허설 힘들었어', { ...base, isDirectRequestTurn: false });
    expect(out).not.toBe('오늘 리허설 힘들었어');
  });

  it('isDirectRequestTurn helper: selfie requests and questions count, small talk does not', () => {
    expect(isDirectRequestTurn('너 셀카 보여줘')).toBe(true);
    expect(isDirectRequestTurn('내일 스케줄 뭐야?')).toBe(true);
    expect(isDirectRequestTurn('오늘 완전 피곤했어 ㅋㅋ')).toBe(false);
  });
});

describe('ensureBegLine — blur-teaser turn (round 2)', () => {
  // On a teaser turn the visible reply is an in-character refusal paired with
  // the blurred card. Appending a hearts-beg ("사줘~") to a refusal is
  // incoherent and competes with the teaser CTA — suppress it.
  it('teaser turn at LOW: no beg appended', () => {
    const out = ensureBegLine('nope, not sending that lol', {
      nudge: 'low',
      slug: 'miku',
      isCrisis: false,
      aiBegged: false,
      language: 'en',
      hasTeaser: true,
      pick: () => 0,
    });
    expect(out).toBe('nope, not sending that lol');
  });

  it('teaser turn at ZERO: no beg appended', () => {
    const out = ensureBegLine('haha nice try', {
      nudge: 'zero',
      slug: 'miku',
      isCrisis: false,
      aiBegged: false,
      language: 'en',
      hasTeaser: true,
      pick: () => 0,
    });
    expect(out).toBe('haha nice try');
  });

  it('no teaser: beg still guaranteed at zero (regression)', () => {
    const out = ensureBegLine('hey', {
      nudge: 'zero',
      slug: 'miku',
      isCrisis: false,
      aiBegged: false,
      language: 'en',
      hasTeaser: false,
      pick: () => 0,
    });
    expect(out).not.toBe('hey');
  });
});
