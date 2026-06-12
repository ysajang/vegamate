/**
 * Regression tests for the amount-verification branch added in BUG-3.
 * Pure logic, no live PayPal / no sandbox — guards against a future edit
 * re-introducing the mismatch-blocks-legit-payment or skips-verification bug.
 *
 * Run: node --test src/lib/payments/fulfillment.test.mjs
 *
 * We re-implement the decision branch under test as a tiny pure function that
 * mirrors fulfillment.ts exactly, because the real module imports Next/Supabase
 * server code that can't load outside the app runtime. The assertion target is
 * the *decision rule*, which is the thing that regresses.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Mirror of the fulfillment.ts amount-check decision (keep in sync).
// Returns 'mismatch' | 'ok' (where 'ok' means "proceed to credit").
function amountDecision(capturedAmountUsd, expectedPriceUsd) {
  if (typeof capturedAmountUsd === 'number' && Number.isFinite(capturedAmountUsd)) {
    const expected = expectedPriceUsd == null ? NaN : Number(expectedPriceUsd);
    if (Number.isFinite(expected) && expected > 0 && Math.abs(capturedAmountUsd - expected) > 0.01) {
      return 'mismatch';
    }
  }
  return 'ok';
}

test('exact match → credits (legit payment must NOT be blocked)', () => {
  assert.equal(amountDecision(0.99, 0.99), 'ok');
  assert.equal(amountDecision(29.99, 29.99), 'ok');
  assert.equal(amountDecision(9.99, '9.99'), 'ok'); // price_usd may arrive as string
});

test('wrong amount → blocked (forged/mismatched capture refused)', () => {
  assert.equal(amountDecision(0.99, 29.99), 'mismatch'); // cheap tx, expensive gift
  assert.equal(amountDecision(29.99, 0.99), 'mismatch');
});

test('sub-cent float drift → allowed (no false reject)', () => {
  assert.equal(amountDecision(9.99, 9.991), 'ok');
  assert.equal(amountDecision(9.989999, 9.99), 'ok');
});

test('no captured amount (webhook fallback) → skip check, credits', () => {
  assert.equal(amountDecision(null, 9.99), 'ok');
  assert.equal(amountDecision(undefined, 9.99), 'ok');
  assert.equal(amountDecision(NaN, 9.99), 'ok');
});

test('unparseable expected price → skip check (never block on bad data)', () => {
  assert.equal(amountDecision(9.99, null), 'ok');
  assert.equal(amountDecision(9.99, 'abc'), 'ok');
});

test('null/empty/zero price must NOT be coerced to 0 and block (BUG-3 edge)', () => {
  // Number(null)===0, Number('')===0 — must not be treated as "expected $0"
  // and flag a real capture as mismatch.
  assert.equal(amountDecision(9.99, null), 'ok');
  assert.equal(amountDecision(9.99, ''), 'ok');
  assert.equal(amountDecision(9.99, undefined), 'ok');
  assert.equal(amountDecision(9.99, 0), 'ok');
});
