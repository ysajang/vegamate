'use client';

import { useState, useEffect, useCallback } from 'react';

interface HeartClaimPopupProps {
  onClaimed?: (amount: number, balance: number) => void;
}

export function HeartClaimPopup({ onClaimed }: HeartClaimPopupProps) {
  const [show, setShow] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [amount, setAmount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [canClaim, setCanClaim] = useState(false);

  // Check if daily claim is available
  useEffect(() => {
    async function check() {
      try {
        const res = await fetch('/api/hearts');
        const json = await res.json();
        if (json.success && json.data.can_claim_daily) {
          setCanClaim(true);
          setShow(true);
        }
      } catch {
        // Silent
      }
    }
    check();
  }, []);

  const handleClaim = useCallback(async () => {
    if (loading || claimed) return;
    setLoading(true);

    try {
      const res = await fetch('/api/hearts/daily', { method: 'POST' });
      const json = await res.json();

      if (json.success && json.data.claimed) {
        setAmount(json.data.amount);
        setClaimed(true);
        onClaimed?.(json.data.amount, json.data.balance);

        // Auto-dismiss after 2s
        setTimeout(() => setShow(false), 2000);
      } else {
        // Already claimed
        setShow(false);
      }
    } catch {
      setShow(false);
    } finally {
      setLoading(false);
    }
  }, [loading, claimed, onClaimed]);

  if (!show || !canClaim) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50"
        style={{ background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(6px)' }}
        onClick={() => !loading && setShow(false)}
      />

      {/* Popup */}
      <div
        className="vm-animate-scale-in fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-3xl px-8 py-7 text-center"
        style={{
          background: 'var(--vm-card)',
          border: '1px solid var(--vm-glass-border)',
          minWidth: 260,
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)',
        }}
      >
        {!claimed ? (
          <>
            <div className="mb-3 text-4xl">💝</div>
            <h3
              className="mb-1 text-[16px] font-semibold"
              style={{ color: 'var(--vm-text-primary)' }}
            >
              Hearts arrived!
            </h3>
            <p
              className="mb-5 text-[13px]"
              style={{ color: 'var(--vm-text-tertiary)' }}
            >
              Tap to receive today&apos;s hearts
            </p>
            <button
              onClick={handleClaim}
              disabled={loading}
              className="w-full rounded-2xl py-3 text-[14px] font-semibold text-white transition-all duration-200 active:scale-95 disabled:opacity-50"
              style={{
                background: 'linear-gradient(135deg, var(--vm-purple-soft), var(--vm-rose))',
              }}
            >
              {loading ? '...' : 'Receive 💕'}
            </button>
          </>
        ) : (
          <>
            <div className="mb-2 text-5xl">🎉</div>
            <h3
              className="mb-1 text-[17px] font-bold"
              style={{ color: 'var(--vm-text-primary)' }}
            >
              +{amount} Hearts!
            </h3>
            <p
              className="text-[13px]"
              style={{ color: 'var(--vm-text-tertiary)' }}
            >
              Have a great chat today
            </p>
          </>
        )}
      </div>
    </>
  );
}
