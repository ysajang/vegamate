import { describe, it, expect } from 'vitest';
import {
  resolveBalanceState,
  buildGiftNudgeDirective,
  resolveGiftSurface,
} from './gift-nudge';

// Spec (P0 monetization trigger):
//   - 잔량 ≤ LOW_BALANCE_THRESHOLD & > 0  -> AI runs, nudged to ask for a gift
//   - 잔량 = 0                            -> AI STILL runs (short, gift-awaiting
//                                            reply + [GIFT] marker). NOT a hard
//                                            system block, NOT a canned wall.
//   - 잔량 정상                           -> AI runs, no forced nudge
//   - subscriber                          -> never nudged, never gated

describe('resolveBalanceState', () => {
  it('normal balance: AI runs, no nudge, not exhausted', () => {
    const s = resolveBalanceState({ heartsRemaining: 20, threshold: 3, isSubscriber: false });
    expect(s.runAiTurn).toBe(true);
    expect(s.nudge).toBe('none');
    expect(s.exhausted).toBe(false);
  });

  it('low balance (<= threshold, > 0): AI runs with low nudge', () => {
    const s = resolveBalanceState({ heartsRemaining: 3, threshold: 3, isSubscriber: false });
    expect(s.runAiTurn).toBe(true);
    expect(s.nudge).toBe('low');
    expect(s.exhausted).toBe(false);
  });

  it('ZERO balance: AI STILL runs with a zero nudge (the bug) — not blocked', () => {
    const s = resolveBalanceState({ heartsRemaining: 0, threshold: 3, isSubscriber: false });
    // This is the core regression: at zero the turn must still run so the
    // character can beg + surface a gift card, instead of an early hard gate.
    expect(s.runAiTurn).toBe(true);
    expect(s.nudge).toBe('zero');
    expect(s.exhausted).toBe(true); // exhausted=true means "input gated AFTER reply", not "skip reply"
  });

  it('subscriber: AI runs, never nudged, never exhausted regardless of balance', () => {
    const s = resolveBalanceState({ heartsRemaining: 0, threshold: 3, isSubscriber: true });
    expect(s.runAiTurn).toBe(true);
    expect(s.nudge).toBe('none');
    expect(s.exhausted).toBe(false);
  });
});

describe('buildGiftNudgeDirective', () => {
  it('returns empty string for normal balance', () => {
    expect(buildGiftNudgeDirective('none', 20)).toBe('');
  });

  it('low nudge: instructs a gift hint and emits guidance, mentions GIFT marker', () => {
    const d = buildGiftNudgeDirective('low', 2);
    expect(d).toContain('[GIFT:');
    expect(d.toUpperCase()).toContain('LOW MESSAGE BALANCE');
    // must forbid guilt-tripping
    expect(d).toMatch(/guilt|blame|FORBIDDEN/i);
  });

  it('zero nudge: SHORT gift-awaiting reply + REQUIRED gift marker', () => {
    const d = buildGiftNudgeDirective('zero', 0);
    expect(d).toContain('[GIFT:');
    // zero state must force the marker (not "maybe"), since the gift card is
    // the only way forward — the reply must carry it every time.
    expect(d).toMatch(/MUST|REQUIRED|always/i);
    // must instruct brevity (short, waiting tone) to avoid infinite free chat
    expect(d).toMatch(/short|brief|짧/i);
    // still no guilt
    expect(d).toMatch(/guilt|blame|FORBIDDEN/i);
    // must NOT leak system words
    expect(d).toMatch(/do not mention|never mention|forbidden/i);
  });
});

describe('resolveGiftSurface (route monetization branching)', () => {
  // The end-to-end proof of the bug fix: what the client actually receives.

  it('LOW (balance 3): model marker -> gift card shown, input NOT gated', () => {
    const low = resolveBalanceState({ heartsRemaining: 3, threshold: 3, isSubscriber: false });
    const s = resolveGiftSurface({
      nudge: low.nudge,
      exhausted: low.exhausted,
      parsedGiftSlug: 'milktea',
      isCrisis: false,
    });
    expect(s.giftSlug).toBe('milktea'); // 조르기 카드 발동
    expect(s.heartsExhausted).toBe(false); // 계속 대화 가능
  });

  it('ZERO (balance 0): model marker -> gift card shown AND input gated after reply', () => {
    const zero = resolveBalanceState({ heartsRemaining: 0, threshold: 3, isSubscriber: false });
    const s = resolveGiftSurface({
      nudge: zero.nudge,
      exhausted: zero.exhausted,
      parsedGiftSlug: 'flowers',
      isCrisis: false,
    });
    expect(s.giftSlug).toBe('flowers'); // 0에서도 선물 카드 노출 (핵심 수정)
    expect(s.heartsExhausted).toBe(true); // 응답 후 입력 게이트
  });

  it('ZERO + NO marker: still shows a fallback gift card (no dead-end)', () => {
    const zero = resolveBalanceState({ heartsRemaining: 0, threshold: 3, isSubscriber: false });
    const s = resolveGiftSurface({
      nudge: zero.nudge,
      exhausted: zero.exhausted,
      parsedGiftSlug: null, // model forgot the marker
      isCrisis: false,
    });
    expect(s.giftSlug).toBe('coffee'); // 폴백 카드 보장
    expect(s.heartsExhausted).toBe(true);
  });

  it('ZERO + CRISIS: no gift card, input NOT gated (support keeps flowing)', () => {
    const zero = resolveBalanceState({ heartsRemaining: 0, threshold: 3, isSubscriber: false });
    const s = resolveGiftSurface({
      nudge: zero.nudge,
      exhausted: zero.exhausted,
      parsedGiftSlug: null,
      isCrisis: true,
    });
    expect(s.giftSlug).toBeNull(); // 위기 시 조르기 억제
    expect(s.heartsExhausted).toBe(false); // 차단 안 함
  });

  it('NORMAL: no gift card, no gating', () => {
    const normal = resolveBalanceState({ heartsRemaining: 20, threshold: 3, isSubscriber: false });
    const s = resolveGiftSurface({
      nudge: normal.nudge,
      exhausted: normal.exhausted,
      parsedGiftSlug: null,
      isCrisis: false,
    });
    expect(s.giftSlug).toBeNull();
    expect(s.heartsExhausted).toBe(false);
  });
});
