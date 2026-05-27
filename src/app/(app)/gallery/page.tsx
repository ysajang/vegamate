'use client';

import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import { BottomNav } from '@/components/common';
import { X } from 'lucide-react';
import type { DbUserSelfieCollection, DbSelfie, DbCharacter, SelfieRarity } from '@/types';

type CollectionItem = DbUserSelfieCollection & {
  selfie?: DbSelfie;
  character?: Pick<DbCharacter, 'id' | 'slug' | 'name' | 'avatar_url'>;
};

/** Rarity border styles — visual only, no text */
function getRarityBorder(rarity: SelfieRarity): string {
  switch (rarity) {
    case 'legendary':
      return '1.5px solid rgba(251, 191, 36, 0.5)';
    case 'epic':
      return '1.5px solid rgba(167, 139, 250, 0.5)';
    case 'rare':
      return '1px solid rgba(96, 165, 250, 0.3)';
    default:
      return '1px solid rgba(255,255,255,0.06)';
  }
}

function getRarityAnimation(rarity: SelfieRarity): string | undefined {
  if (rarity === 'legendary') return 'vm-glow-gold 2s ease-in-out infinite';
  if (rarity === 'epic') return 'vm-glow-secret 2s ease-in-out infinite';
  return undefined;
}

// ── Filter Bar ──────────────────────────────────────────────
function FilterBar({
  active,
  onChange,
  characters,
}: {
  active: string;
  onChange: (v: string) => void;
  characters: { id: string; name: string }[];
}) {
  const filters = [
    { id: 'all', label: 'All' },
    ...characters.map((c) => ({ id: c.id, label: c.name })),
    { id: 'special', label: 'Special' },
  ];

  return (
    <div className="vm-scrollbar-hide flex gap-2 overflow-x-auto px-4">
      {filters.map((f) => {
        const isActive = active === f.id;
        return (
          <button
            key={f.id}
            onClick={() => onChange(f.id)}
            className="flex-shrink-0 whitespace-nowrap rounded-full px-4 py-[7px] text-[13px] font-medium transition-all duration-200"
            style={{
              background: isActive ? 'var(--vm-purple-deep)' : 'transparent',
              color: isActive ? '#FFF' : 'var(--vm-text-secondary)',
              border: isActive ? 'none' : '1px solid rgba(255,255,255,0.1)',
            }}
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Selfie Card ─────────────────────────────────────────────
function SelfieCard({
  item,
  index,
  onTap,
}: {
  item: CollectionItem;
  index: number;
  onTap: (item: CollectionItem) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const rarity = item.rarity || item.selfie?.rarity || 'common';
  const border = getRarityBorder(rarity);
  const animation = getRarityAnimation(rarity);
  const imageUrl = item.selfie?.thumbnail_url || item.selfie?.image_url;

  return (
    <div
      onClick={() => onTap(item)}
      className="vm-animate-fade-in-up relative cursor-pointer overflow-hidden"
      style={{
        aspectRatio: '3/4',
        borderRadius: 14,
        border,
        animation: animation
          ? `${animation}, vm-fadeInUp 0.35s ease-out ${index * 0.04}s both`
          : `vm-fadeInUp 0.35s ease-out ${index * 0.04}s both`,
      }}
    >
      {imageUrl ? (
        <>
          {!loaded && (
            <div
              className="vm-animate-shimmer absolute inset-0"
              style={{ background: 'var(--vm-card)' }}
            />
          )}
          <Image
            src={imageUrl}
            alt={item.selfie?.scene || 'selfie'}
            fill
            className="object-cover transition-opacity duration-300"
            style={{ opacity: loaded ? 1 : 0 }}
            sizes="(max-width: 428px) 33vw, 140px"
            onLoad={() => setLoaded(true)}
          />
        </>
      ) : (
        <div
          className="flex h-full w-full items-center justify-center"
          style={{ background: 'var(--vm-card)' }}
        >
          <span className="text-2xl opacity-40">📸</span>
        </div>
      )}

      {/* Date overlay */}
      <div
        className="absolute inset-x-0 bottom-0 px-2 pb-2 pt-5"
        style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.7))' }}
      >
        <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
          {new Date(item.obtained_at).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          })}
        </span>
      </div>
    </div>
  );
}

// ── Fullscreen Modal ────────────────────────────────────────
function SelfieModal({
  item,
  onClose,
}: {
  item: CollectionItem | null;
  onClose: () => void;
}) {
  if (!item) return null;

  const imageUrl = item.selfie?.image_url;
  const charName = item.character?.name || 'Unknown';
  const scene = item.selfie?.scene || '';
  const date = new Date(item.obtained_at).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const rarity = item.rarity || item.selfie?.rarity || 'common';
  const border = getRarityBorder(rarity);
  const animation = getRarityAnimation(rarity);

  return (
    <div
      className="vm-animate-fade-in fixed inset-0 z-50 flex flex-col items-center justify-center p-6"
      style={{
        background: 'rgba(0,0,0,0.88)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
      onClick={onClose}
    >
      {/* Close button */}
      <button
        className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-full"
        style={{ background: 'rgba(255,255,255,0.08)' }}
        onClick={onClose}
      >
        <X className="size-5" style={{ color: 'rgba(255,255,255,0.6)' }} />
      </button>

      {/* Large image */}
      <div
        className="overflow-hidden"
        style={{
          borderRadius: 20,
          border,
          animation,
          maxWidth: 320,
          maxHeight: '70vh',
          width: '100%',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={scene}
            width={320}
            height={450}
            className="h-auto w-full object-cover"
          />
        ) : (
          <div
            className="flex h-[380px] w-full items-center justify-center"
            style={{ background: 'var(--vm-card)' }}
          >
            <span className="text-5xl opacity-40">📸</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="mt-4 text-center" onClick={(e) => e.stopPropagation()}>
        <p
          className="text-lg font-semibold"
          style={{ color: 'var(--vm-text-primary)' }}
        >
          {charName}
        </p>
        <p
          className="mt-1 text-[13px]"
          style={{ color: 'var(--vm-text-tertiary)' }}
        >
          {scene ? `${scene} · ${date}` : date}
        </p>
      </div>
    </div>
  );
}

// ── Main Gallery Page ───────────────────────────────────────
export default function GalleryPage() {
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [selectedItem, setSelectedItem] = useState<CollectionItem | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/collection');
        const json = await res.json();
        if (json.success) {
          setItems(json.data.collection);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Extract unique characters from items
  const uniqueChars = items.reduce<{ id: string; name: string }[]>((acc, item) => {
    if (item.character && !acc.find((c) => c.id === item.character!.id)) {
      acc.push({ id: item.character.id, name: item.character.name });
    }
    return acc;
  }, []);

  // Filter logic
  const filtered = items.filter((item) => {
    if (filter === 'all') return true;
    if (filter === 'special') {
      const r = item.rarity || item.selfie?.rarity;
      return r === 'rare' || r === 'epic' || r === 'legendary';
    }
    return item.character_id === filter;
  });

  const totalCount = items.length;

  return (
    <main
      className="flex h-dvh flex-col"
      style={{ background: 'var(--vm-base)' }}
    >
      {/* Header */}
      <div className="px-4 pb-3 pt-4">
        <div className="flex items-center justify-between">
          <h1
            className="text-2xl font-bold"
            style={{ color: 'var(--vm-text-primary)', letterSpacing: '-0.02em' }}
          >
            Gallery
          </h1>
          {totalCount > 0 && (
            <span
              className="text-sm font-semibold"
              style={{ color: 'var(--vm-purple-soft)' }}
            >
              {totalCount} photos
            </span>
          )}
        </div>
      </div>

      {/* Filters */}
      {uniqueChars.length > 0 && (
        <div className="pb-3">
          <FilterBar active={filter} onChange={setFilter} characters={uniqueChars} />
        </div>
      )}

      {/* Grid */}
      <div className="vm-scrollbar-hide flex-1 overflow-y-auto px-4 pb-4">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <div
              className="size-5 animate-spin rounded-full border-2 border-t-transparent"
              style={{ borderColor: 'var(--vm-purple-soft)', borderTopColor: 'transparent' }}
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2">
            <span className="text-3xl opacity-30">📸</span>
            <p className="text-sm" style={{ color: 'var(--vm-text-tertiary)' }}>
              {totalCount === 0
                ? 'No photos yet — keep chatting!'
                : 'No photos match this filter'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2.5">
            {filtered.map((item, i) => (
              <SelfieCard
                key={item.id}
                item={item}
                index={i}
                onTap={setSelectedItem}
              />
            ))}
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <BottomNav />

      {/* Fullscreen Modal */}
      <SelfieModal item={selectedItem} onClose={() => setSelectedItem(null)} />
    </main>
  );
}
