'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { SelfieRarity } from '@/types';

/** Visual-only rarity colors — no text labels exposed to users */
const RARITY_VISUAL: Record<SelfieRarity, { border: string; glow?: string }> = {
  common: { border: 'transparent' },
  uncommon: { border: 'transparent' },
  rare: { border: 'rgba(96, 165, 250, 0.3)' },
  epic: { border: 'rgba(167, 139, 250, 0.5)' },
  legendary: { border: 'rgba(251, 191, 36, 0.5)', glow: 'vm-glow-gold' },
};

interface SelfieImageProps {
  src: string;
  alt?: string;
  rarity: SelfieRarity;
  /** Inline = in chat bubble / Expanded = fullscreen modal */
  variant?: 'inline' | 'expanded';
  onTap?: () => void;
  className?: string;
}

export function SelfieImage({
  src,
  alt = 'selfie',
  rarity,
  variant = 'inline',
  onTap,
  className = '',
}: SelfieImageProps) {
  const [loaded, setLoaded] = useState(false);
  const visual = RARITY_VISUAL[rarity] || RARITY_VISUAL.common;
  const isLegendary = rarity === 'legendary';
  const isExpanded = variant === 'expanded';

  return (
    <div
      onClick={onTap}
      className={`relative overflow-hidden ${onTap ? 'cursor-pointer' : ''} ${className}`}
      style={{
        borderRadius: isExpanded ? 16 : 14,
        border:
          visual.border !== 'transparent'
            ? `1.5px solid ${visual.border}`
            : 'none',
        animation: isLegendary ? 'vm-glow-gold 2s ease-in-out infinite' : 'none',
      }}
    >
      {/* Shimmer placeholder before load */}
      {!loaded && (
        <div
          className="vm-animate-shimmer absolute inset-0"
          style={{
            width: isExpanded ? 320 : 220,
            height: isExpanded ? 420 : 280,
            background: 'var(--vm-card)',
          }}
        />
      )}

      <Image
        src={src}
        alt={alt}
        width={isExpanded ? 320 : 220}
        height={isExpanded ? 420 : 280}
        className="object-cover transition-opacity duration-300"
        style={{
          opacity: loaded ? 1 : 0,
          width: isExpanded ? 320 : '100%',
          height: isExpanded ? 420 : 'auto',
          maxHeight: isExpanded ? 420 : 280,
        }}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}
