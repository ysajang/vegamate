'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { FeedbackTrigger } from '@/components/common';

/**
 * PayPal redirect return page.
 *
 * Gift:         ?type=gift&tx={txId}&token={orderId}   -> capture, credit hearts
 * Subscription: ?type=subscription&sub={subId}&subscription_id=... -> poll status
 *               (activation lands via webhook)
 * Cancel:       &cancelled=true on either type
 */

type Phase = 'processing' | 'success' | 'cancelled' | 'error';

function ReturnContent() {
  const params = useSearchParams();
  const [phase, setPhase] = useState<Phase>('processing');
  const [detail, setDetail] = useState<string>('');

  const type = params.get('type');
  const cancelled = params.get('cancelled') === 'true';
  const txId = params.get('tx');
  const orderId = params.get('token'); // PayPal appends token={orderId}
  const subId = params.get('sub');

  useEffect(() => {
    let stopped = false;

    async function run() {
      if (cancelled) {
        // Fire-and-forget: release the reserved spend so an abandoned
        // checkout doesn't eat the user's daily cap. UI flips regardless.
        if (type === 'gift' && txId) {
          fetch('/api/gifts/capture', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transaction_id: txId, cancelled: true }),
          }).catch(() => {});
        }
        setPhase('cancelled');
        return;
      }

      if (type === 'gift' && txId && orderId) {
        try {
          const res = await fetch('/api/gifts/capture', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transaction_id: txId, order_id: orderId }),
          });
          const json = await res.json();
          if (!stopped) {
            if (json.success && (json.data?.completed || json.data?.already_completed)) {
              // Internal hearts accounting stays server-side; the user only
              // sees the gift framing (currency units never surface).
              setDetail('Your gift has been delivered 💝');
              setPhase('success');
            } else {
              setPhase('error');
            }
          }
        } catch {
          if (!stopped) setPhase('error');
        }
        return;
      }

      if (type === 'subscription' && subId) {
        // Activation arrives via webhook — poll up to ~30s.
        for (let i = 0; i < 15; i++) {
          if (stopped) return;
          try {
            const res = await fetch(`/api/subscriptions/status?sub=${subId}`);
            const json = await res.json();
            const status = json.data?.status;
            if (status === 'active') {
              setDetail('Subscription active');
              setPhase('success');
              return;
            }
            if (status === 'canceled' || status === 'expired') {
              setPhase('error');
              return;
            }
          } catch {
            // keep polling
          }
          await new Promise((r) => setTimeout(r, 2000));
        }
        if (!stopped) {
          // Payment may still be settling — treat as soft success.
          setDetail('Almost there — your subscription is being activated.');
          setPhase('success');
        }
        return;
      }

      setPhase('error');
    }

    run();
    return () => {
      stopped = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      {phase === 'processing' && (
        <>
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent opacity-60" />
          <p className="text-sm opacity-70">Confirming your payment…</p>
        </>
      )}
      {phase === 'success' && (
        <>
          <div className="text-4xl">💜</div>
          <p className="text-lg font-medium">Payment complete</p>
          {detail && <p className="text-sm opacity-70">{detail}</p>}
          <p className="text-sm opacity-50">You can close this tab and return to your chat.</p>
        </>
      )}
      {phase === 'cancelled' && (
        <>
          <div className="text-4xl">↩️</div>
          <p className="text-lg font-medium">Payment cancelled</p>
          <p className="text-sm opacity-50">No charge was made. You can close this tab.</p>
        </>
      )}
      {phase === 'error' && (
        <>
          <div className="text-4xl">⚠️</div>
          <p className="text-lg font-medium">Something went wrong</p>
          <p className="text-sm opacity-70">
            If you were charged, your purchase will be confirmed automatically within a few
            minutes. Otherwise, please try again.
          </p>
          <div className="mt-2">
            <FeedbackTrigger
              variant="link"
              defaultCategory="payment"
              label="Payment issue? Contact us"
            />
          </div>
        </>
      )}
    </div>
  );
}

export default function PaymentReturnPage() {
  return (
    <Suspense fallback={null}>
      <ReturnContent />
    </Suspense>
  );
}
