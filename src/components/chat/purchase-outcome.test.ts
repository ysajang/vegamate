import { describe, it, expect } from 'vitest';
import { resolvePurchaseOutcome } from './purchase-outcome';

// Spec — /api/gifts/purchase 응답을 UI 상태로 분류.
//   근본원인: GiftButton이 success+checkout_url만 처리하고 그 외(blocked/에러/네트워크)는
//   무음 -> 버튼이 "죽은 것처럼" 보이는 블랭크. GiftSheet 수준의 분기를 공통화.

describe('resolvePurchaseOutcome', () => {
  it('checkout_url 있음 -> redirect', () => {
    const r = resolvePurchaseOutcome({ success: true, data: { checkout_url: 'https://x' } });
    expect(r.kind).toBe('redirect');
    if (r.kind === 'redirect') expect(r.url).toBe('https://x');
  });

  it('blocked age_gate -> age_gate', () => {
    const r = resolvePurchaseOutcome({ success: true, data: { blocked: true, reason: 'age_gate' } });
    expect(r.kind).toBe('age_gate');
  });

  it('blocked daily_cap -> notice (한도 안내)', () => {
    const r = resolvePurchaseOutcome({ success: true, data: { blocked: true, reason: 'daily_cap' } });
    expect(r.kind).toBe('notice');
    if (r.kind === 'notice') expect(r.message).toBeTruthy();
  });

  it('blocked cooldown -> notice', () => {
    const r = resolvePurchaseOutcome({ success: true, data: { blocked: true, reason: 'cooldown' } });
    expect(r.kind).toBe('notice');
    if (r.kind === 'notice') expect(r.message).toBeTruthy();
  });

  it('success지만 checkout_url 없음(예상밖) -> error', () => {
    const r = resolvePurchaseOutcome({ success: true, data: {} });
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.message).toBeTruthy();
  });

  it('success=false -> error', () => {
    const r = resolvePurchaseOutcome({ success: false, error: 'boom' });
    expect(r.kind).toBe('error');
  });

  it('null/garbage 응답 -> error (throw 없음)', () => {
    expect(resolvePurchaseOutcome(null).kind).toBe('error');
    expect(resolvePurchaseOutcome(undefined).kind).toBe('error');
    expect(resolvePurchaseOutcome('nope').kind).toBe('error');
  });

  it('blocked인데 reason 미상 -> error(일반 안내)', () => {
    const r = resolvePurchaseOutcome({ success: true, data: { blocked: true } });
    expect(r.kind).toBe('error');
  });
});
