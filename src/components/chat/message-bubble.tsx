'use client';

import { useState } from 'react';
import Image from 'next/image';
import { CharacterAvatar } from '@/components/common';
import type { DbMessage, DbSelfie, SelfieRarity } from '@/types';

/** Visual-only rarity borders — no text exposed */
function getRarityBorder(rarity: SelfieRarity): string {
  switch (rarity) {
    case 'legendary':
      return '1.5px solid rgba(251, 191, 36, 0.5)';
    case 'epic':
      return '1.5px solid rgba(167, 139, 250, 0.5)';
    case 'rare':
      return '1px solid rgba(96, 165, 250, 0.3)';
    default:
      return 'none';
  }
}

function getRarityAnimation(rarity: SelfieRarity): string | undefined {
  if (rarity === 'legendary') return 'vm-glow-gold 2s ease-in-out infinite';
  return undefined;
}

interface SelfieInlineProps {
  selfie: DbSelfie;
}

function SelfieInline({ selfie }: SelfieInlineProps) {
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const border = getRarityBorder(selfie.rarity);
  const animation = getRarityAnimation(selfie.rarity);

  if (expanded) {
    return (
      <div
        className="vm-animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6"
        style={{ backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
        onClick={() => setExpanded(false)}
      >
        <div
          className="overflow-hidden"
          style={{
            borderRadius: 16,
            border,
            animation,
            maxWidth: 340,
            maxHeight: '80vh',
          }}
        >
          <Image
            src={selfie.image_url}
            alt="selfie"
            width={340}
            height={450}
            className="h-auto w-full object-cover"
          />
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => setExpanded(true)}
      className="relative cursor-pointer overflow-hidden"
      style={{
        borderRadius: 14,
        border,
        animation,
        maxWidth: 220,
      }}
    >
      {/* Shimmer loader */}
      {!loaded && (
        <div
          className="vm-animate-shimmer"
          style={{
            width: 220,
            height: 280,
            background: 'var(--vm-card)',
          }}
        />
      )}

      <Image
        src={selfie.image_url}
        alt="selfie"
        width={220}
        height={280}
        className="w-full object-cover transition-opacity duration-300"
        style={{
          opacity: loaded ? 1 : 0,
          maxHeight: 280,
        }}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}

interface MessageBubbleProps {
  message: DbMessage;
  characterAvatar?: string;
  characterName?: string;
  /** Accent color for character avatar fallback */
  accentColor?: string;
}

export function MessageBubble({
  message,
  characterAvatar,
  characterName,
  accentColor = 'var(--vm-rose)',
}: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const selfie = message.selfie;

  // Time formatting
  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div
      className={`flex items-end gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* Avatar — AI messages only */}
      {!isUser && (
        <CharacterAvatar
          src={characterAvatar}
          name={characterName || 'AI'}
          size={32}
          accentColor={accentColor}
        />
      )}

      <div className="flex max-w-[78%] flex-col gap-1">
        {/* Text bubble */}
        {message.content && (
          <div
            className={isUser ? 'vm-bubble-user' : 'vm-bubble-ai'}
            style={{
              padding: '10px 16px',
              color: isUser ? '#FFF' : 'var(--vm-text-primary)',
              fontSize: 15,
              lineHeight: 1.5,
              letterSpacing: '-0.01em',
            }}
          >
            <p className="whitespace-pre-wrap">{message.content}</p>
          </div>
        )}

        {/* Selfie image */}
        {selfie?.image_url && (
          <SelfieInline selfie={selfie} />
        )}

        {/* Time + read indicator */}
        <div
          className={`flex items-center gap-1.5 ${isUser ? 'justify-end pr-0.5' : 'justify-start pl-0.5'}`}
        >
          <span
            className="text-[11px]"
            style={{ color: 'var(--vm-text-tertiary)' }}
          >
            {time}
          </span>
          {isUser && (
            <span
              className="text-[11px]"
              style={{ color: 'var(--vm-purple-soft)' }}
            >
              ✓✓
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
