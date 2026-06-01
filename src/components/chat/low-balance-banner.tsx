'use client';

import { Heart, Gift } from 'lucide-react';

interface LowBalanceBannerProps {
  /** Current heart (message) balance. */
  balance: number;
  /** Threshold at/below which this banner shows. */
  threshold: number;
  /** Character accent color for theming the CTA. */
  accentColor: string;
  /** Opens the gift sheet so the user can top up before running out. */
  onOpenGift: () => void;
}

/**
 * Proactive low-balance nudge shown just above the chat input.
 *
 * Why this exists: previously a user only discovered they were out of messages
 * AFTER sending one (the turn failed and the character said goodbye). That's a
 * dead-end error moment and a poor place to ask for money. Instead we surface
 * the remaining count early and invite a gift purchase (which grants hearts)
 * BEFORE the wall — converting at "low fuel" instead of "empty tank".
 *
 * Rendered only when 0 < balance <= threshold. At exactly 0 the page shows the
 * full exhaustion gift sheet, so this banner steps aside.
 */
export function LowBalanceBanner({
  balance,
  threshold,
  accentColor,
  onOpenGift,
}: LowBalanceBannerProps) {
  if (balance <= 0 || balance > threshold) return null;

  const isLast = balance === 1;

  return (
    <div
      className="vm-animate-fade-in mx-auto flex w-full max-w-lg items-center gap-3 px-3.5 py-2.5"
      style={{
        background: 'rgba(10, 10, 18, 0.95)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '0.5px solid var(--vm-glass-border)',
      }}
    >
      {/* Remaining-hearts indicator */}
      <div className="flex items-center gap-1" aria-hidden>
        {Array.from({ length: threshold }).map((_, i) => (
          <Heart
            key={i}
            className="size-[15px]"
            style={{
              color: i < balance ? 'var(--vm-rose)' : 'var(--vm-text-tertiary)',
              fill: i < balance ? 'var(--vm-rose)' : 'transparent',
              opacity: i < balance ? 1 : 0.35,
            }}
            strokeWidth={2}
          />
        ))}
      </div>

      <p
        className="flex-1 text-[13px] leading-snug"
        style={{ color: 'var(--vm-text-secondary)', letterSpacing: '-0.01em' }}
      >
        {isLast ? (
          <>
            Last message left.{' '}
            <span style={{ color: 'var(--vm-text-primary)', fontWeight: 600 }}>
              Send a gift to keep talking.
            </span>
          </>
        ) : (
          <>
            <span style={{ color: 'var(--vm-text-primary)', fontWeight: 600 }}>
              {balance} messages
            </span>{' '}
            left — top up with a gift?
          </>
        )}
      </p>

      <button
        type="button"
        onClick={onOpenGift}
        className="flex flex-shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold transition-transform active:scale-95"
        style={{
          background: accentColor,
          color: '#FFF',
          boxShadow: `0 4px 14px ${accentColor}55`,
        }}
      >
        <Gift className="size-[15px]" strokeWidth={2.5} />
        Gift
      </button>
    </div>
  );
}
