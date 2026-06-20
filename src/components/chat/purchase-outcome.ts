/**
 * /api/gifts/purchase 응답을 UI가 처리할 결과로 분류.
 *
 * GiftButton(인라인)과 GiftSheet가 동일 분기를 공유하기 위한 순수 함수.
 * 근본원인: GiftButton이 success+checkout_url만 처리하고 그 외(blocked/에러/
 * 네트워크 실패)는 무음 -> 버튼이 죽은 것처럼 보이는 "블랭크".
 */
export type PurchaseOutcome =
  | { kind: 'redirect'; url: string }
  | { kind: 'age_gate' }
  | { kind: 'notice'; message: string }
  | { kind: 'error'; message: string };

const GENERIC_ERROR =
  'Something went wrong starting the payment. Please try again.';

export function resolvePurchaseOutcome(json: unknown): PurchaseOutcome {
  if (!json || typeof json !== 'object') {
    return { kind: 'error', message: GENERIC_ERROR };
  }

  const j = json as {
    success?: boolean;
    data?: {
      checkout_url?: string;
      blocked?: boolean;
      reason?: string;
    };
  };

  const data = j.data ?? {};

  if (j.success && typeof data.checkout_url === 'string' && data.checkout_url) {
    return { kind: 'redirect', url: data.checkout_url };
  }

  if (j.success && data.blocked) {
    switch (data.reason) {
      case 'age_gate':
        return { kind: 'age_gate' };
      case 'daily_cap':
        return {
          kind: 'notice',
          message:
            "You've been so generous today 💝 Daily gift limit reached — see you tomorrow!",
        };
      case 'cooldown':
        return {
          kind: 'notice',
          message: 'Just a moment between gifts — please try again shortly.',
        };
      default:
        return { kind: 'error', message: GENERIC_ERROR };
    }
  }

  return { kind: 'error', message: GENERIC_ERROR };
}
