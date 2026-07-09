'use client';

import { useState, useEffect } from 'react';
import { AgeVerifyInline } from './age-verify-inline';

interface Tier {
  slug: string;
  name: string;
  price_usd: number;
  billing_interval: string;
  unlimited_hearts: boolean;
  lover_mode: boolean;
  perks: string[];
}

interface UpgradePromptProps {
  /** Tier slug suggested by the backend at this emotional peak. */
  tierSlug: 'deeper' | 'lover';
  characterId: string;
  characterName: string;
  /** Called when the user dismisses (no purchase). */
  onDismiss: () => void;
}

/**
 * In-chat subscription upgrade prompt.
 *
 * Design constraints (compliance + anti-dark-pattern):
 *  - price, billing interval, and perks are shown plainly before any action
 *  - the dismiss ("Not now") control has equal visual weight to the CTA
 *  - no fake scarcity, no pre-checked anything, no hidden charges
 *  - surfaced only at a real relationship milestone (gated server-side)
 */
export function UpgradePrompt({
  tierSlug,
  characterId,
  characterName,
  onDismiss,
}: UpgradePromptProps) {
  const [tier, setTier] = useState<Tier | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showAgeVerify, setShowAgeVerify] = useState(false);
  const [minorBlocked, setMinorBlocked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/subscriptions/tiers');
        const json = await res.json();
        if (!cancelled && json.success) {
          const found = (json.data.tiers as Tier[]).find((t) => t.slug === tierSlug);
          if (found) setTier(found);
        }
      } catch {
        /* silent — prompt simply won't render */
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [tierSlug]);

  const handleUpgrade = async () => {
    if (loading) return;
    setLoading(true);
    setNotice(null);
    try {
      const res = await fetch('/api/subscriptions/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tier_slug: tierSlug,
          surface: 'upgrade_prompt',
          character_id: characterId,
        }),
      });
      const json = await res.json();

      if (json.success && json.data?.checkout_url) {
        // Same-tab: in-app browsers (Meta ad traffic) block window.open —
        // it killed every checkout (0/30 captured). return_url resumes here.
        window.location.assign(json.data.checkout_url);
        return;
      }

      // Guard blocked (age / cooldown / cap) — show a plain reason.
      if (json.success && json.data?.blocked) {
        const r = json.data.reason;
        if (r === 'age_gate') {
          // Existing user whose profile predates the onboarding age step.
          // Surface an inline verify form; on success we auto-retry checkout.
          setShowAgeVerify(true);
          setNotice(null);
        } else {
          setNotice(
            r === 'cooldown'
              ? '잠시 후 다시 시도해 주세요.'
              : '오늘 결제 한도에 도달했어요.'
          );
        }
      } else {
        setNotice('지금은 진행할 수 없어요. 잠시 후 다시 시도해 주세요.');
      }
    } catch {
      setNotice('네트워크 오류예요. 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  if (!tier) return null;

  const interval = tier.billing_interval === 'year' ? '년' : '월';

  return (
    <div
      className="mt-2 w-full max-w-[300px] rounded-2xl p-4"
      style={{
        background: 'rgba(124, 58, 237, 0.08)',
        border: '1px solid rgba(124, 58, 237, 0.22)',
      }}
    >
      <div className="text-[13px] font-semibold" style={{ color: 'var(--vm-purple-soft)' }}>
        {tierSlug === 'lover'
          ? `${characterName}와(과) 더 가까워졌어요`
          : `${characterName}와(과) 더 깊은 이야기를`}
      </div>

      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-[20px] font-bold" style={{ color: 'var(--vm-purple-soft)' }}>
          ${tier.price_usd}
        </span>
        <span className="text-[12px] opacity-70">/ {interval} · {tier.name}</span>
      </div>

      <ul className="mt-2 space-y-1">
        {tier.perks.map((perk, i) => (
          <li key={i} className="flex items-start gap-1.5 text-[12px] opacity-90">
            <span style={{ color: 'var(--vm-purple-soft)' }}>·</span>
            <span>{perk}</span>
          </li>
        ))}
      </ul>

      <p className="mt-2 text-[10px] leading-tight opacity-55">
        구독은 {interval}마다 자동 갱신되며 언제든 해지할 수 있어요. 가격은 부가세 별도입니다.
      </p>

      {notice && (
        <p className="mt-2 text-[11px]" style={{ color: '#f59e0b' }}>
          {notice}
        </p>
      )}

      {minorBlocked ? (
        <p className="mt-3 text-[12px] leading-relaxed" style={{ color: 'var(--vm-text-secondary)' }}>
          만 19세 이상만 구독할 수 있어요. 이용에 참고해 주세요.
        </p>
      ) : showAgeVerify ? (
        <AgeVerifyInline
          onVerified={() => {
            setShowAgeVerify(false);
            // Age now verified server-side — retry the original checkout.
            handleUpgrade();
          }}
          onMinor={() => {
            setShowAgeVerify(false);
            setMinorBlocked(true);
          }}
        />
      ) : (
        <div className="mt-3 flex gap-2">
          <button
            onClick={handleUpgrade}
            disabled={loading}
            className="flex-1 rounded-full px-3 py-2 text-[13px] font-medium transition-all duration-200 active:scale-95 disabled:opacity-50"
            style={{ background: 'var(--vm-purple, #7c3aed)', color: '#fff' }}
          >
            {loading ? '여는 중...' : '시작하기'}
          </button>
          <button
            onClick={onDismiss}
            disabled={loading}
            className="flex-1 rounded-full px-3 py-2 text-[13px] font-medium transition-all duration-200 active:scale-95 disabled:opacity-50"
            style={{
              background: 'transparent',
              color: 'var(--vm-text-soft, #888)',
              border: '1px solid rgba(255,255,255,0.12)',
            }}
          >
            다음에
          </button>
        </div>
      )}
    </div>
  );
}
