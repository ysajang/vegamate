import { describe, it, expect, vi, beforeEach } from 'vitest';

// sendGiftReaction은 외부 부수효과 → mock (충전 로직과 무관)
vi.mock('@/lib/chat/gift-reaction', () => ({
  sendGiftReaction: vi.fn().mockResolvedValue(undefined),
}));

import { fulfillGiftTransaction } from './fulfillment';

/**
 * Supabase service client mock 빌더.
 * 실제 fulfillment가 호출하는 체인만 구현:
 *   .from(t).select().eq().single()         -> tx 조회 / conversation 조회
 *   .from(t).update().eq()                  -> status 갱신
 *   .rpc('add_hearts'|'bump_intimacy', ...) -> 크레딧/친밀도
 *
 * 실제 도착한 PAYMENT.CAPTURE.COMPLETED 페이로드 구조를 반영:
 *   gifts.price_usd는 문자열("0.99"), hearts_granted는 정수.
 */
function makeClient(opts: {
  tx: Record<string, unknown> | null;
  addHeartsReturn?: number | null;
  addHeartsError?: unknown;
}) {
  const calls = {
    addHearts: [] as Array<{ p_user_id: unknown; p_amount: unknown }>,
    bumpIntimacy: [] as unknown[],
    updates: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  };

  const client = {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  // conversations 조회 (user_id + character_id)
                  return { single: async () => ({ data: { id: 'conv-1' } }) };
                },
                single: async () => {
                  if (table === 'gift_transactions') return { data: opts.tx };
                  return { data: null };
                },
              };
            },
          };
        },
        update(payload: Record<string, unknown>) {
          calls.updates.push({ table, payload });
          return { eq: async () => ({ data: null, error: null }) };
        },
      };
    },
    rpc(fn: string, args: Record<string, unknown>) {
      if (fn === 'add_hearts') {
        calls.addHearts.push(args as { p_user_id: unknown; p_amount: unknown });
        return Promise.resolve({
          data: opts.addHeartsReturn ?? null,
          error: opts.addHeartsError ?? null,
        });
      }
      if (fn === 'bump_intimacy') {
        calls.bumpIntimacy.push(args);
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };

  return { client: client as never, calls };
}

const baseTx = {
  id: 'tx-1',
  status: 'pending',
  user_id: 'user-1',
  character_id: 'char-1',
  hearts_granted: 15,
  gift: { price_usd: '0.99' }, // 실제 스키마: 문자열
};

describe('fulfillGiftTransaction — 금액 위조 방어 (BUG-3)', () => {
  it('캡처금액이 기대금액과 다르면 충전 거부 + tx failed', async () => {
    // $0.99 짜리인데 $0.01만 캡처된 것으로 위조
    const { client, calls } = makeClient({ tx: { ...baseTx }, addHeartsReturn: 50 });
    const res = await fulfillGiftTransaction(client, 'tx-1', 'cap-1', 0.01);

    expect(res.ok).toBe(false);
    expect(res.error).toBe('amount_mismatch');
    // 핵심: add_hearts 절대 호출 안 됨
    expect(calls.addHearts.length).toBe(0);
    // tx는 failed로 마킹
    expect(calls.updates.some(u => u.payload.status === 'failed')).toBe(true);
  });

  it('정확히 일치하면 정상 충전', async () => {
    const { client, calls } = makeClient({ tx: { ...baseTx }, addHeartsReturn: 50 });
    const res = await fulfillGiftTransaction(client, 'tx-1', 'cap-1', 0.99);

    expect(res.ok).toBe(true);
    expect(res.newBalance).toBe(50);
    expect(calls.addHearts.length).toBe(1);
    expect(calls.addHearts[0].p_amount).toBe(15);
  });

  it('0.01 이내 부동소수 오차는 허용 (0.989 ≈ 0.99)', async () => {
    const { client, calls } = makeClient({ tx: { ...baseTx }, addHeartsReturn: 50 });
    const res = await fulfillGiftTransaction(client, 'tx-1', 'cap-1', 0.989);
    expect(res.ok).toBe(true);
    expect(calls.addHearts.length).toBe(1);
  });

  it('캡처금액 미해결(null)이면 금액검증 건너뜀 + custom_id 신뢰로 충전', async () => {
    const { client, calls } = makeClient({ tx: { ...baseTx }, addHeartsReturn: 50 });
    const res = await fulfillGiftTransaction(client, 'tx-1', 'cap-1', null);
    expect(res.ok).toBe(true);
    expect(calls.addHearts.length).toBe(1);
  });
});

describe('fulfillGiftTransaction — 멱등 (double-confirm)', () => {
  it('이미 completed면 재충전 없이 no-op', async () => {
    const { client, calls } = makeClient({
      tx: { ...baseTx, status: 'completed' },
      addHeartsReturn: 50,
    });
    const res = await fulfillGiftTransaction(client, 'tx-1', 'cap-1', 0.99);

    expect(res.ok).toBe(true);
    expect(res.alreadyCompleted).toBe(true);
    // 핵심: 두 번째 호출(webhook 재전송/capture 후 webhook)은 add_hearts 안 함
    expect(calls.addHearts.length).toBe(0);
  });

  it('tx 없으면 transaction_not_found', async () => {
    const { client, calls } = makeClient({ tx: null });
    const res = await fulfillGiftTransaction(client, 'missing', 'cap-1', 0.99);
    expect(res.ok).toBe(false);
    expect(res.error).toBe('transaction_not_found');
    expect(calls.addHearts.length).toBe(0);
  });
});

describe('fulfillGiftTransaction — 충전 실패 처리', () => {
  it('add_hearts가 null 반환하면 credit_failed (completed로 안 넘김)', async () => {
    const { client, calls } = makeClient({ tx: { ...baseTx }, addHeartsReturn: null });
    const res = await fulfillGiftTransaction(client, 'tx-1', 'cap-1', 0.99);
    expect(res.ok).toBe(false);
    expect(res.error).toBe('credit_failed');
    // status=completed 업데이트가 일어나면 안 됨
    expect(calls.updates.some(u => u.payload.status === 'completed')).toBe(false);
  });
});
