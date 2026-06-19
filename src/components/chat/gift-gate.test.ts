import { describe, it, expect } from 'vitest';
import { shouldReopenGiftSheet } from './gift-gate';

// At zero balance the composer is tappable but "locked": tapping it reopens the
// gift sheet (payment funnel). A short cooldown after a close prevents the
// close-tap from instantly reopening the sheet (flicker), while a deliberate
// later tap still reopens it.

const COOLDOWN = 400; // ms

describe('shouldReopenGiftSheet', () => {
  it('opens when never closed before', () => {
    expect(
      shouldReopenGiftSheet({ now: 1000, lastClosedAt: null, cooldownMs: COOLDOWN })
    ).toBe(true);
  });

  it('does NOT reopen during the cooldown right after a close (anti-flicker)', () => {
    expect(
      shouldReopenGiftSheet({ now: 1100, lastClosedAt: 1000, cooldownMs: COOLDOWN })
    ).toBe(false);
  });

  it('reopens on a deliberate tap after the cooldown elapses', () => {
    expect(
      shouldReopenGiftSheet({ now: 1500, lastClosedAt: 1000, cooldownMs: COOLDOWN })
    ).toBe(true);
  });

  it('reopens exactly at the cooldown boundary', () => {
    expect(
      shouldReopenGiftSheet({ now: 1400, lastClosedAt: 1000, cooldownMs: COOLDOWN })
    ).toBe(true);
  });
});
