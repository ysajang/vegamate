'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { DbCharacter } from '@/types';

/** Map character slug to accent color */
function getAccentColor(slug: string): string {
  if (slug === 'ren') return 'var(--vm-cool)';
  return 'var(--vm-rose)';
}

/** Map character slug to dark photo background */
function getPhotoBg(slug: string): string {
  if (slug === 'ren') return '#0F1520';
  return '#2D1B35';
}

export default function SelectPage() {
  const [characters, setCharacters] = useState<DbCharacter[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchDelta, setTouchDelta] = useState(0);
  const router = useRouter();

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/characters');
        const json = await res.json();
        if (json.success) {
          setCharacters(json.data.characters);
        }
      } catch {
        // retry silently
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const goTo = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= characters.length) return;
      setCurrentIndex(idx);
      setTouchDelta(0);
    },
    [characters.length]
  );

  const handleSelect = useCallback(
    async (characterId: string) => {
      if (starting) return;
      setStarting(characterId);

      try {
        const res = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ character_id: characterId }),
        });
        const json = await res.json();

        if (json.success) {
          router.push(`/chat/${json.data.conversation.id}`);
        }
      } catch {
        setStarting(null);
      }
    },
    [starting, router]
  );

  function handleTouchStart(e: React.TouchEvent) {
    setTouchStart(e.touches[0].clientX);
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (touchStart === null) return;
    setTouchDelta(e.touches[0].clientX - touchStart);
  }

  function handleTouchEnd() {
    if (Math.abs(touchDelta) > 60) {
      if (touchDelta < 0 && currentIndex < characters.length - 1) {
        goTo(currentIndex + 1);
      } else if (touchDelta > 0 && currentIndex > 0) {
        goTo(currentIndex - 1);
      } else {
        setTouchDelta(0);
      }
    } else {
      setTouchDelta(0);
    }
    setTouchStart(null);
  }

  if (loading) {
    return (
      <main
        className="flex min-h-dvh items-center justify-center"
        style={{ background: 'var(--vm-base)' }}
      >
        <div
          className="size-6 animate-spin rounded-full border-2 border-t-transparent"
          style={{ borderColor: 'var(--vm-purple-soft)', borderTopColor: 'transparent' }}
        />
      </main>
    );
  }

  if (characters.length === 0) {
    return (
      <main
        className="flex min-h-dvh items-center justify-center"
        style={{ background: 'var(--vm-base)' }}
      >
        <p style={{ color: 'var(--vm-text-tertiary)' }}>No characters available</p>
      </main>
    );
  }

  const char = characters[currentIndex];
  const accent = getAccentColor(char.slug);
  const photoBg = getPhotoBg(char.slug);

  return (
    <main
      className="vm-tap-none flex h-dvh select-none flex-col"
      style={{ background: 'var(--vm-base)' }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* ── Photo area (fills top) ── */}
      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden"
        style={{
          background: photoBg,
          transform: `translateX(${touchDelta * 0.3}px)`,
          transition: touchStart !== null ? 'none' : 'transform 0.3s ease',
        }}
      >
        {/* Photo segment indicators */}
        <div className="absolute left-4 right-4 top-3 z-10 flex gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-[3px] flex-1 rounded-full"
              style={{ background: i === 0 ? '#FFF' : 'rgba(255,255,255,0.25)' }}
            />
          ))}
        </div>

        {/* Character image or placeholder */}
        {char.avatar_url ? (
          <Image
            src={char.avatar_url}
            alt={char.name}
            fill
            className="object-cover"
            style={{ objectPosition: '50% 25%' }}
            priority
          />
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div
              className="flex size-[120px] items-center justify-center rounded-full text-5xl font-bold text-white"
              style={{ background: accent, opacity: 0.8 }}
            >
              {char.name.charAt(0)}
            </div>
            <span className="text-[13px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
              character photo
            </span>
          </div>
        )}

        {/* Bottom fade */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[120px]"
          style={{ background: `linear-gradient(transparent, var(--vm-base))` }}
        />

        {/* Name + age overlay */}
        <div className="vm-animate-fade-in-up absolute bottom-3 left-5">
          <span
            className="text-[32px] font-bold tracking-tight text-white"
            style={{ letterSpacing: '-0.02em' }}
          >
            {char.name}
          </span>
        </div>

        {/* Nav arrows */}
        {currentIndex > 0 && (
          <button
            onClick={() => goTo(currentIndex - 1)}
            className="absolute left-3 top-[45%] z-10 flex size-9 items-center justify-center rounded-full"
            style={{
              background: 'rgba(255,255,255,0.08)',
              backdropFilter: 'blur(12px)',
              color: 'rgba(255,255,255,0.6)',
            }}
          >
            <ChevronLeft className="size-4" />
          </button>
        )}
        {currentIndex < characters.length - 1 && (
          <button
            onClick={() => goTo(currentIndex + 1)}
            className="absolute right-3 top-[45%] z-10 flex size-9 items-center justify-center rounded-full"
            style={{
              background: 'rgba(255,255,255,0.08)',
              backdropFilter: 'blur(12px)',
              color: 'rgba(255,255,255,0.6)',
            }}
          >
            <ChevronRight className="size-4" />
          </button>
        )}

        {/* Loading overlay */}
        {starting === char.id && (
          <div
            className="absolute inset-0 z-20 flex items-center justify-center"
            style={{ background: 'rgba(10, 10, 18, 0.6)', backdropFilter: 'blur(8px)' }}
          >
            <div
              className="size-6 animate-spin rounded-full border-2 border-t-transparent"
              style={{ borderColor: accent, borderTopColor: 'transparent' }}
            />
          </div>
        )}
      </div>

      {/* ── Bio ── */}
      <div className="px-5 pt-3" style={{ background: 'var(--vm-base)' }}>
        <p
          className="text-[14px] italic"
          style={{ color: 'var(--vm-text-tertiary)', lineHeight: 1.5 }}
        >
          {char.greeting_message || `Chat with ${char.name}`}
        </p>
      </div>

      {/* ── Dots ── */}
      <div
        className="flex items-center justify-center gap-2 py-4"
        style={{ background: 'var(--vm-base)' }}
      >
        {characters.map((_, i) => (
          <div
            key={i}
            className="rounded-full transition-all duration-300"
            style={{
              width: i === currentIndex ? 24 : 8,
              height: 8,
              background: i === currentIndex ? accent : 'rgba(255,255,255,0.15)',
            }}
          />
        ))}
      </div>

      {/* ── Action buttons ── */}
      <div
        className="vm-safe-bottom flex items-center justify-center gap-5 px-8 pb-2 pt-1"
        style={{ background: 'var(--vm-base)' }}
      >
        {/* Skip */}
        <button
          onClick={() => {
            if (currentIndex < characters.length - 1) goTo(currentIndex + 1);
            else goTo(0);
          }}
          className="flex size-[52px] items-center justify-center rounded-full text-xl"
          style={{
            border: '1.5px solid rgba(255,255,255,0.12)',
            background: 'rgba(255,255,255,0.05)',
            color: 'rgba(255,255,255,0.5)',
          }}
          aria-label="Skip"
        >
          ✕
        </button>

        {/* Chat CTA */}
        <button
          onClick={() => handleSelect(char.id)}
          disabled={starting !== null}
          className="flex size-16 items-center justify-center rounded-full text-[26px] transition-transform active:scale-95 disabled:opacity-60"
          style={{
            background: accent,
            boxShadow: `0 4px 20px ${accent === 'var(--vm-cool)' ? 'rgba(122,139,158,0.4)' : 'rgba(244,63,94,0.4)'}`,
          }}
          aria-label={`Chat with ${char.name}`}
        >
          💬
        </button>

        {/* Favorite */}
        <button
          className="flex size-[52px] items-center justify-center rounded-full text-xl"
          style={{
            border: '1.5px solid rgba(255,255,255,0.12)',
            background: 'rgba(255,255,255,0.05)',
            color: 'rgba(255,255,255,0.5)',
          }}
          aria-label="Favorite"
        >
          ★
        </button>
      </div>
    </main>
  );
}
