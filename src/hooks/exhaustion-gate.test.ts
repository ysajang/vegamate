import { describe, it, expect } from 'vitest';
import { shouldGateInput, shouldClearGateOnClose } from './exhaustion-gate';

// The infinite-loop bug: closing the gift sheet without paying re-enabled the
// input, letting a zero-balance user chat forever and re-trigger the beg + sheet
// every turn. Closing must NOT clear the gate; only a real refill does.

describe('shouldGateInput (lock the composer when out of hearts)', () => {
  it('locks at balance 0 (non-subscriber)', () => {
    expect(shouldGateInput({ balance: 0, isSubscriber: false })).toBe(true);
  });
  it('does NOT lock with balance remaining', () => {
    expect(shouldGateInput({ balance: 5, isSubscriber: false })).toBe(false);
  });
  it('never locks a subscriber even at 0', () => {
    expect(shouldGateInput({ balance: 0, isSubscriber: true })).toBe(false);
  });
  it('treats null balance (not yet loaded) as not-gated (avoid flicker-lock)', () => {
    expect(shouldGateInput({ balance: null, isSubscriber: false })).toBe(false);
  });
});

describe('shouldClearGateOnClose (closing the sheet must NOT unlock unpaid)', () => {
  it('does NOT clear the gate when balance is still 0', () => {
    expect(shouldClearGateOnClose({ balance: 0 })).toBe(false);
  });
  it('clears the gate only once hearts were actually refilled (>0)', () => {
    expect(shouldClearGateOnClose({ balance: 12 })).toBe(true);
  });
});
