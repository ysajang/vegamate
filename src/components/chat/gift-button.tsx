'use client';

import { useState, useEffect } from 'react';
import type { DbGift } from '@/types';
import { resolvePurchaseOutcome } from './purchase-outcome';

interface GiftButtonProps {
  giftSlug: string;
  characterId: string;
  /** Character display name — payment moment is framed as "Gift for {name}". */
  characterName?: string;
  onPurchaseStart?: () => void;
  onPurchaseComplete?: () => void;
}

export function GiftButton({
  giftSlug,
  characterId,
  characterName,
  onPurchaseStart,
  onPurchaseComplete,
}: GiftButtonProps) {
  const [gift, setGift] = useState<Pick<DbGift, 'emoji' | 'name' | 'price_usd'> | null>(null);
  const [loading, setLoading] = useState(false);
  /** User-facing message when the purchase can't proceed (blocked / error / popup). */
  const [notice, setNotice] = useState<string | null>(null);

  // Fetch gift details from cache or API
  useEffect(() => {
    async function loadGift() {
      try {
        const res = await fetch('/api/gifts');
        const json = await res.json();
        if (json.success) {
          const found = json.data.gifts.find(
            (g: { slug: string }) => g.slug === giftSlug
          );
          if (found) {
            setGift({ emoji: found.emoji, name: found.name, price_usd: found.price_usd });
          }
        }
      } catch {
        // Silent
      }
    }
    loadGift();
  }, [giftSlug]);

  const handlePurchase = async () => {
    if (loading) return;
    setLoading(true);
    setNotice(null);
    onPurchaseStart?.();

    try {
      const res = await fetch('/api/gifts/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gift_slug: giftSlug,
          character_id: characterId,
        }),
      });

      const json = await res.json().catch(() => null);
      const outcome = resolvePurchaseOutcome(json);

      switch (outcome.kind) {
        case 'redirect': {
          // Same-tab: in-app browsers (Meta ad traffic) block window.open —
          // it killed every checkout (0/30 captured). return_url resumes here.
          onPurchaseComplete?.();
          window.location.assign(outcome.url);
          break;
        }
        case 'age_gate':
          // Inline age verification lives in the gift sheet; guide the user there.
          setNotice('A quick age check is needed first — open the gift menu to verify.');
          break;
        case 'notice':
          setNotice(outcome.message);
          break;
        case 'error':
          setNotice(outcome.message);
          break;
      }
    } catch {
      setNotice('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!gift) return null;

  return (
    <div className="mt-2 flex flex-col gap-1">
      <button
        onClick={handlePurchase}
        disabled={loading}
        className="inline-flex items-center gap-1.5 self-start rounded-full px-3.5 py-2 text-[13px] font-medium transition-all duration-200 active:scale-95 disabled:opacity-50"
        style={{
          background: 'rgba(124, 58, 237, 0.12)',
          color: 'var(--vm-purple-soft)',
          border: '1px solid rgba(124, 58, 237, 0.2)',
        }}
      >
        <span className="text-base">{gift.emoji}</span>
        <span>
          {loading
            ? 'Opening...'
            : characterName
              ? `Gift for ${characterName} — ${gift.name} $${Number(gift.price_usd).toFixed(2)}`
              : `${gift.name} $${Number(gift.price_usd).toFixed(2)}`}
        </span>
      </button>
      {notice && (
        <span
          className="text-[12px]"
          style={{ color: 'var(--vm-text-tertiary)' }}
        >
          {notice}
        </span>
      )}
    </div>
  );
}
