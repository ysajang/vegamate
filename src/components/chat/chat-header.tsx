'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { CharacterAvatar } from '@/components/common';

interface ChatHeaderProps {
  characterName: string;
  characterAvatar: string;
  /** When set, tapping the avatar/name opens the "Our Story" album. */
  characterId?: string;
  /** Accent color CSS value — defaults to Miku rose */
  accentColor?: string;
  creditsRemaining?: number | null;
}

export function ChatHeader({
  characterName,
  characterAvatar,
  characterId,
  accentColor = 'var(--vm-rose)',
}: ChatHeaderProps) {
  const router = useRouter();

  return (
    <header
      className="vm-glass-heavy vm-tap-none sticky top-0 z-10 flex items-center gap-3 px-3.5 py-2.5"
      style={{ borderBottom: '0.5px solid var(--vm-glass-border)' }}
    >
      {/* Back button */}
      <button
        onClick={() => router.push('/select')}
        className="flex size-9 items-center justify-center rounded-xl transition-colors"
        style={{ color: 'var(--vm-text-secondary)' }}
        aria-label="Back to character select"
      >
        <ArrowLeft className="size-[18px]" />
      </button>

      {/* Avatar + name — tap to open the relationship album */}
      <button
        onClick={() => characterId && router.push(`/memories/${characterId}`)}
        disabled={!characterId}
        className="flex flex-1 items-center gap-3 text-left"
        aria-label={`Open your story with ${characterName}`}
      >
        <CharacterAvatar
          src={characterAvatar}
          name={characterName}
          size={40}
          accentColor={accentColor}
          showOnline
          glow
        />
        <div className="flex-1">
          <p
            className="text-[16px] font-semibold leading-tight"
            style={{ color: 'var(--vm-text-primary)' }}
          >
            {characterName}
          </p>
          <p
            className="text-xs font-medium"
            style={{ color: 'var(--vm-online)' }}
          >
            online now
          </p>
        </div>
      </button>
    </header>
  );
}
