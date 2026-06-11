'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { AgeVerifyInline } from './age-verify-inline';

interface GiftItem {
  id: string;
  slug: string;
  name: string;
  emoji: string;
  price_usd: number;
}

interface GiftSheetProps {
  isOpen: boolean;
  onClose: () => void;
  characterId: string;
  /** Character display name — the sheet is framed as gifting THIS character. */
  characterName?: string;
  exhaustionMessage?: string | null;
}

export function GiftSheet({
  isOpen,
  onClose,
  characterId,
  characterName,
  exhaustionMessage,
}: GiftSheetProps) {
  const [gifts, setGifts] = useState<GiftItem[]>([]);
  const [loadingSlug, setLoadingSlug] = useState<string | null>(null);
  /** Spending-guard outcome that needs user-facing handling. */
  const [notice, setNotice] = useState<string | null>(null);
  /** Server said age_gate — show the inline DOB verification. */
  const [needsAgeVerify, setNeedsAgeVerify] = useState(false);
  /** Gift the user tried to buy before the age gate, retried after verify. */
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    async function loadGifts() {
      try {
        const res = await fetch('/api/gifts');
        const json = await res.json();
        if (json.success) {
          setGifts(json.data.gifts);
        }
      } catch {
        // Silent
      }
    }
    loadGifts();
  }, [isOpen]);

  const handlePurchase = async (slug: string) => {
    if (loadingSlug) return;
    setLoadingSlug(slug);
    setNotice(null);

    try {
      const res = await fetch('/api/gifts/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gift_slug: slug,
          character_id: characterId,
        }),
      });

      const json = await res.json();

      if (json.success && json.data?.checkout_url) {
        window.open(json.data.checkout_url, '_blank');
        return;
      }

      // Spending guard outcomes — previously ignored, which made the buy
      // button appear dead. Each gets explicit, in-tone handling.
      if (json.success && json.data?.blocked) {
        if (json.data.reason === 'age_gate') {
          setPendingSlug(slug);
          setNeedsAgeVerify(true);
        } else if (json.data.reason === 'daily_cap') {
          setNotice("You've been so generous today 💝 Daily gift limit reached — see you tomorrow!");
        } else if (json.data.reason === 'cooldown') {
          setNotice('Just a moment between gifts — please try again shortly.');
        }
        return;
      }

      setNotice("Something went wrong starting the payment. Please try again.");
    } catch {
      setNotice('Network error. Please try again.');
    } finally {
      setLoadingSlug(null);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="vm-animate-slide-up fixed inset-x-0 bottom-0 z-50 rounded-t-[20px] px-4 pb-8 pt-4"
        style={{
          background: 'var(--vm-card)',
          borderTop: '1px solid var(--vm-glass-border)',
          maxHeight: '70vh',
          overflowY: 'auto',
        }}
      >
        {/* Handle + close */}
        <div className="mb-3 flex items-center justify-between">
          <div
            className="mx-auto h-1 w-10 rounded-full"
            style={{ background: 'var(--vm-text-tertiary)' }}
          />
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-full p-1.5"
            style={{ color: 'var(--vm-text-tertiary)' }}
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Spending-guard / error notice */}
        {notice && (
          <div
            className="mb-3 rounded-2xl px-4 py-3 text-center text-[13px]"
            style={{
              background: 'rgba(244, 114, 182, 0.08)',
              color: 'var(--vm-text-secondary)',
            }}
          >
            {notice}
          </div>
        )}

        {/* One-time age verification (server-blocked: age_gate) */}
        {needsAgeVerify && (
          <div
            className="mb-4 rounded-2xl px-4 pb-4 pt-1"
            style={{
              background: 'rgba(124, 58, 237, 0.08)',
              border: '1px solid var(--vm-glass-border)',
            }}
          >
            <AgeVerifyInline
              onVerified={() => {
                setNeedsAgeVerify(false);
                const retry = pendingSlug;
                setPendingSlug(null);
                if (retry) handlePurchase(retry);
              }}
              onMinor={() => {
                setNeedsAgeVerify(false);
                setPendingSlug(null);
                setNotice('Purchases require verified adults (19+).');
              }}
            />
          </div>
        )}

        {/* Exhaustion message */}
        {exhaustionMessage && (
          <div
            className="mb-4 rounded-2xl px-4 py-3 text-center text-[14px]"
            style={{
              background: 'rgba(124, 58, 237, 0.08)',
              color: 'var(--vm-text-secondary)',
            }}
          >
            {exhaustionMessage}
          </div>
        )}

        <h3
          className="mb-1 text-center text-[15px] font-semibold"
          style={{ color: 'var(--vm-text-primary)' }}
        >
          {characterName ? `Gift for ${characterName} 🎁` : 'Send a gift 🎁'}
        </h3>
        {/* Transparent causality: a gift = more time together. The internal
            currency conversion is never shown — only the relational effect. */}
        <p
          className="mb-4 text-center text-[12px]"
          style={{ color: 'var(--vm-text-tertiary)' }}
        >
          A gift means more time together
        </p>

        {/* Gift grid */}
        <div className="grid grid-cols-3 gap-2.5">
          {gifts.map((gift) => (
            <button
              key={gift.slug}
              onClick={() => handlePurchase(gift.slug)}
              disabled={loadingSlug !== null}
              className="flex flex-col items-center gap-1 rounded-2xl p-3 transition-all duration-150 active:scale-95 disabled:opacity-50"
              style={{
                background: 'rgba(26, 26, 46, 0.5)',
                border: '1px solid var(--vm-glass-border)',
              }}
            >
              <span className="text-2xl">{gift.emoji}</span>
              <span
                className="text-[11px] font-medium"
                style={{ color: 'var(--vm-text-secondary)' }}
              >
                {gift.name}
              </span>
              <span
                className="text-[11px]"
                style={{ color: 'var(--vm-purple-soft)' }}
              >
                {loadingSlug === gift.slug ? '...' : `$${Number(gift.price_usd).toFixed(2)}`}
              </span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
