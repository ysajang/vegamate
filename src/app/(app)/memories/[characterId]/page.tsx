'use client';

/**
 * "Our Story" — the relationship memory album for one character.
 *
 * Design contract:
 *  - tone = memory album, NOT a stats dashboard and NOT a retention threat.
 *    The accumulated record speaks for itself; no "don't lose this" copy.
 *  - currency rule: hearts/credits/balances never appear. Gifts are shown by
 *    item name + date only.
 */
import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { CharacterAvatar } from '@/components/common';

interface AlbumCharacter {
  id: string;
  slug: string;
  name: string;
  avatar_url: string;
}

interface AlbumRelationship {
  stage: number;
  days_together: number;
  message_count: number;
  selfie_count: number;
  since: string;
}

interface AlbumMemory {
  key: string;
  value: string;
  type: string;
}

interface AlbumGift {
  id: string;
  date: string;
  gift: { slug: string; name: string; emoji: string } | null;
}

interface SelfiePreview {
  id: string;
  selfie?: { id: string; image_url: string; thumbnail_url: string | null; rarity: string };
}

/** Relationship stage → relational label (never a number, never a metric). */
const STAGE_LABELS: Record<number, string> = {
  0: 'Just met',
  1: 'Getting closer',
  2: 'Close',
  3: 'Trusted',
  4: 'Devoted',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function MemoriesPage({
  params,
}: {
  params: Promise<{ characterId: string }>;
}) {
  const { characterId } = use(params);
  const router = useRouter();

  const [character, setCharacter] = useState<AlbumCharacter | null>(null);
  const [relationship, setRelationship] = useState<AlbumRelationship | null>(null);
  const [memories, setMemories] = useState<AlbumMemory[]>([]);
  const [gifts, setGifts] = useState<AlbumGift[]>([]);
  const [selfies, setSelfies] = useState<SelfiePreview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stopped = false;
    async function load() {
      try {
        const [albumRes, collectionRes] = await Promise.all([
          fetch(`/api/memories/${characterId}`),
          fetch(`/api/collection?character_id=${characterId}`),
        ]);
        const album = await albumRes.json();
        const collection = await collectionRes.json();
        if (stopped) return;

        if (album.success) {
          setCharacter(album.data.character);
          setRelationship(album.data.relationship);
          setMemories(album.data.memories || []);
          setGifts(album.data.gifts || []);
        }
        if (collection.success) {
          setSelfies((collection.data.collection || []).slice(0, 6));
        }
      } catch {
        // Silent
      } finally {
        if (!stopped) setLoading(false);
      }
    }
    load();
    return () => {
      stopped = true;
    };
  }, [characterId]);

  const accentColor = character?.slug === 'ren' ? 'var(--vm-cool)' : 'var(--vm-rose)';

  return (
    <main
      className="flex min-h-dvh flex-col"
      style={{ background: 'var(--vm-base)' }}
    >
      {/* Header */}
      <header
        className="vm-glass-heavy sticky top-0 z-10 flex items-center gap-3 px-3.5 py-2.5"
        style={{ borderBottom: '0.5px solid var(--vm-glass-border)' }}
      >
        <button
          onClick={() => router.back()}
          className="flex size-9 items-center justify-center rounded-xl"
          style={{ color: 'var(--vm-text-secondary)' }}
          aria-label="Back"
        >
          <ArrowLeft className="size-[18px]" />
        </button>
        <p
          className="text-[16px] font-semibold"
          style={{ color: 'var(--vm-text-primary)' }}
        >
          Our Story
        </p>
      </header>

      <div className="mx-auto w-full max-w-lg flex-1 px-4 pb-10">
        {loading ? (
          <p
            className="mt-16 text-center text-[13px]"
            style={{ color: 'var(--vm-text-tertiary)' }}
          >
            Opening the album...
          </p>
        ) : !character ? (
          <p
            className="mt-16 text-center text-[13px]"
            style={{ color: 'var(--vm-text-tertiary)' }}
          >
            Couldn&apos;t open this album.
          </p>
        ) : (
          <>
            {/* Hero */}
            <section className="mt-8 flex flex-col items-center text-center">
              <CharacterAvatar
                src={character.avatar_url}
                name={character.name}
                size={84}
                accentColor={accentColor}
                glow
              />
              <h1
                className="mt-3 text-[20px] font-bold"
                style={{ color: 'var(--vm-text-primary)' }}
              >
                You &amp; {character.name}
              </h1>
              {relationship && (
                <>
                  <span
                    className="mt-1.5 rounded-full px-3 py-1 text-[12px] font-medium"
                    style={{
                      background: 'rgba(124, 58, 237, 0.12)',
                      color: 'var(--vm-purple-soft)',
                    }}
                  >
                    {STAGE_LABELS[relationship.stage] ?? STAGE_LABELS[0]}
                  </span>
                  <p
                    className="mt-2 text-[13px]"
                    style={{ color: 'var(--vm-text-tertiary)' }}
                  >
                    Together since {formatDate(relationship.since)} ·{' '}
                    {relationship.days_together} {relationship.days_together === 1 ? 'day' : 'days'}
                    {' · '}
                    {relationship.message_count.toLocaleString()} messages shared
                  </p>
                </>
              )}
            </section>

            {/* What {name} remembers */}
            <section className="mt-9">
              <h2
                className="mb-3 text-[14px] font-semibold"
                style={{ color: 'var(--vm-text-primary)' }}
              >
                What {character.name} remembers about you
              </h2>
              {memories.length === 0 ? (
                <p
                  className="rounded-2xl px-4 py-5 text-center text-[13px]"
                  style={{
                    background: 'rgba(26, 26, 46, 0.5)',
                    border: '1px solid var(--vm-glass-border)',
                    color: 'var(--vm-text-tertiary)',
                  }}
                >
                  Your story is just beginning — keep talking and{' '}
                  {character.name} will remember the little things.
                </p>
              ) : (
                <ul className="space-y-2">
                  {memories.map((m) => (
                    <li
                      key={m.key}
                      className="rounded-2xl px-4 py-3 text-[13px] leading-relaxed"
                      style={{
                        background: 'rgba(26, 26, 46, 0.5)',
                        border: '1px solid var(--vm-glass-border)',
                        color: 'var(--vm-text-secondary)',
                      }}
                    >
                      {m.value}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Selfie gallery preview */}
            {selfies.length > 0 && (
              <section className="mt-9">
                <button
                  onClick={() => router.push('/gallery')}
                  className="mb-3 flex w-full items-center justify-between"
                >
                  <h2
                    className="text-[14px] font-semibold"
                    style={{ color: 'var(--vm-text-primary)' }}
                  >
                    Photos from {character.name}
                  </h2>
                  <ChevronRight
                    className="size-4"
                    style={{ color: 'var(--vm-text-tertiary)' }}
                  />
                </button>
                <div className="grid grid-cols-3 gap-2">
                  {selfies.map((item) =>
                    item.selfie ? (
                      <div
                        key={item.id}
                        className="relative aspect-square overflow-hidden rounded-xl"
                        style={{ border: '1px solid var(--vm-glass-border)' }}
                      >
                        <Image
                          src={item.selfie.thumbnail_url || item.selfie.image_url}
                          alt=""
                          fill
                          sizes="(max-width: 512px) 33vw, 160px"
                          className="object-cover"
                        />
                      </div>
                    ) : null
                  )}
                </div>
              </section>
            )}

            {/* Gift history */}
            {gifts.length > 0 && (
              <section className="mt-9">
                <h2
                  className="mb-3 text-[14px] font-semibold"
                  style={{ color: 'var(--vm-text-primary)' }}
                >
                  Gifts you&apos;ve given
                </h2>
                <ul className="space-y-2">
                  {gifts.map((g) =>
                    g.gift ? (
                      <li
                        key={g.id}
                        className="flex items-center gap-3 rounded-2xl px-4 py-3"
                        style={{
                          background: 'rgba(26, 26, 46, 0.5)',
                          border: '1px solid var(--vm-glass-border)',
                        }}
                      >
                        <span className="text-xl">{g.gift.emoji}</span>
                        <span
                          className="flex-1 text-[13px] font-medium"
                          style={{ color: 'var(--vm-text-secondary)' }}
                        >
                          {g.gift.name}
                        </span>
                        <span
                          className="text-[12px]"
                          style={{ color: 'var(--vm-text-tertiary)' }}
                        >
                          {formatDate(g.date)}
                        </span>
                      </li>
                    ) : null
                  )}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
