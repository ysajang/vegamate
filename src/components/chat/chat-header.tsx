'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Coins } from 'lucide-react';

interface ChatHeaderProps {
  characterName: string;
  characterAvatar: string;
  creditsRemaining: number | null;
}

export function ChatHeader({ characterName, characterAvatar, creditsRemaining }: ChatHeaderProps) {
  const router = useRouter();

  return (
    <header className="flex items-center gap-3 border-b border-border/50 bg-background/80 px-3 py-2.5 backdrop-blur-sm">
      <button
        onClick={() => router.push('/select')}
        className="flex size-8 items-center justify-center rounded-full transition-colors hover:bg-muted"
        aria-label="Back to character select"
      >
        <ArrowLeft className="size-5" />
      </button>

      <Image
        src={characterAvatar}
        alt={characterName}
        width={36}
        height={36}
        className="size-9 rounded-full object-cover"
      />

      <div className="flex-1">
        <p className="text-sm font-semibold">{characterName}</p>
        <p className="text-[11px] text-green-400">online</p>
      </div>

      {creditsRemaining !== null && (
        <div className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1">
          <Coins className="size-3.5 text-amber-400" />
          <span className="text-xs font-semibold tabular-nums text-amber-400">
            {creditsRemaining}
          </span>
        </div>
      )}
    </header>
  );
}
