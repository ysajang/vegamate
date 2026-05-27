'use client';

import { useState, useEffect } from 'react';
import type { DbGift } from '@/types';

interface GiftButtonProps {
  giftSlug: string;
  characterId: string;
  onPurchaseStart?: () => void;
  onPurchaseComplete?: () => void;
}

export function GiftButton({
  giftSlug,
  characterId,
  onPurchaseStart,
  onPurchaseComplete,
}: GiftButtonProps) {
  const [gift, setGift] = useState<Pick<DbGift, 'emoji' | 'name' | 'price_usd'> | null>(null);
  const [loading, setLoading] = useState(false);

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

      const json = await res.json();

      if (json.success && json.data.checkout_url) {
        // Open Creem checkout
        window.open(json.data.checkout_url, '_blank');
        onPurchaseComplete?.();
      }
    } catch {
      // Silent
    } finally {
      setLoading(false);
    }
  };

  if (!gift) return null;

  return (
    <button
      onClick={handlePurchase}
      disabled={loading}
      className="mt-2 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium transition-all duration-200 active:scale-95 disabled:opacity-50"
      style={{
        background: 'rgba(124, 58, 237, 0.12)',
        color: 'var(--vm-purple-soft)',
        border: '1px solid rgba(124, 58, 237, 0.2)',
      }}
    >
      <span className="text-base">{gift.emoji}</span>
      <span>
        {loading ? 'Opening...' : `${gift.name} $${gift.price_usd}`}
      </span>
    </button>
  );
}
