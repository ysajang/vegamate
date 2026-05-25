'use client';

import Image from 'next/image';
import { RARITY_COLORS, RARITY_LABELS } from '@/config/constants';
import type { DbMessage, SelfieRarity } from '@/types';

interface MessageBubbleProps {
  message: DbMessage;
  characterAvatar?: string;
  characterName?: string;
}

function RarityBadge({ rarity }: { rarity: SelfieRarity }) {
  return (
    <span
      className="absolute top-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm"
      style={{
        backgroundColor: `${RARITY_COLORS[rarity]}30`,
        color: RARITY_COLORS[rarity],
        border: `1px solid ${RARITY_COLORS[rarity]}50`,
      }}
    >
      {RARITY_LABELS[rarity]}
    </span>
  );
}

export function MessageBubble({ message, characterAvatar, characterName }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const hasSelfie = message.selfie_id !== null;
  const selfie = (message as DbMessage & { selfie?: { image_url: string; rarity: SelfieRarity } }).selfie;

  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar (AI only) */}
      {!isUser && (
        <div className="mt-auto flex-shrink-0">
          {characterAvatar ? (
            <Image
              src={characterAvatar}
              alt={characterName || 'AI'}
              width={32}
              height={32}
              className="size-8 rounded-full object-cover"
            />
          ) : (
            <div className="flex size-8 items-center justify-center rounded-full bg-primary/20 text-xs font-bold">
              {characterName?.[0] || '?'}
            </div>
          )}
        </div>
      )}

      {/* Bubble */}
      <div
        className={`max-w-[80%] space-y-2 ${
          isUser
            ? 'rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-primary-foreground'
            : 'rounded-2xl rounded-bl-md bg-card px-3.5 py-2.5 text-card-foreground'
        }`}
      >
        {/* Text content */}
        {message.content && (
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
            {message.content}
          </p>
        )}

        {/* Selfie image */}
        {hasSelfie && selfie?.image_url && (
          <div className="relative overflow-hidden rounded-xl">
            <Image
              src={selfie.image_url}
              alt="selfie"
              width={280}
              height={350}
              className="w-full object-cover"
              style={{ maxHeight: 350 }}
            />
            {message.selfie_rarity && (
              <RarityBadge rarity={message.selfie_rarity} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
