'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import type { DbCharacter } from '@/types';

export default function SelectPage() {
  const [characters, setCharacters] = useState<DbCharacter[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);
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

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto max-w-lg px-4 py-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Choose your companion</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Who do you want to talk to today?
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {characters.map((char) => (
            <button
              key={char.id}
              onClick={() => handleSelect(char.id)}
              disabled={starting !== null}
              className="group relative flex flex-col items-center overflow-hidden rounded-2xl border border-border/50 bg-card p-4 text-center transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 active:scale-[0.98] disabled:opacity-60"
            >
              {starting === char.id && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-sm">
                  <div className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              )}

              <div className="relative mb-3 overflow-hidden rounded-xl">
                <Image
                  src={char.avatar_url}
                  alt={char.name}
                  width={140}
                  height={180}
                  className="h-[180px] w-[140px] object-cover transition-transform group-hover:scale-105"
                />
              </div>

              <p className="text-base font-semibold">{char.name}</p>

              <div className="mt-1.5 flex flex-wrap justify-center gap-1">
                {char.personality_tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
