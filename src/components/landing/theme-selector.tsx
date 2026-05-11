'use client';

import { useState } from 'react';
import Image from 'next/image';
import { PreregisterForm } from './preregister-form';

type Theme = 'fantasy' | 'modern' | null;

const THEMES = [
  {
    id: 'fantasy' as const,
    title: 'Fantasy & Sci-Fi',
    desc: 'Space elves, star pilots, mage warriors',
    image: '/fantasy-preview.webp',
    border: 'border-violet-500/40',
    hoverBorder: 'hover:border-violet-400/80',
    textColor: 'text-violet-300',
    overlay: 'from-violet-950/80 via-violet-950/50 to-transparent',
  },
  {
    id: 'modern' as const,
    title: 'Modern & Realistic',
    desc: 'College students, baristas, trainers',
    image: '/modern-preview.webp',
    border: 'border-rose-500/40',
    hoverBorder: 'hover:border-rose-400/80',
    textColor: 'text-rose-300',
    overlay: 'from-rose-950/80 via-rose-950/50 to-transparent',
  },
];

export function ThemeSelector() {
  const [selected, setSelected] = useState<Theme>(null);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4">
      {!selected ? (
        <>
          <h3 className="text-center text-base font-semibold text-muted-foreground sm:text-lg">
            Which characters would you spend on?
          </h3>
          <div className="grid w-full max-w-xl grid-cols-2 gap-4">
            {THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelected(t.id)}
                className={`group relative overflow-hidden rounded-2xl border-2 ${t.border} ${t.hoverBorder} transition-all hover:scale-[1.02] active:scale-[0.98]`}
              >
                <div className="relative aspect-[3/4] w-full">
                  <Image
                    src={t.image}
                    alt={t.title}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    sizes="(max-width: 768px) 50vw, 300px"
                    priority
                  />
                  <div className={`absolute inset-0 bg-gradient-to-t ${t.overlay}`} />
                  <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-4 sm:p-5">
                    <span className={`text-base font-bold sm:text-lg ${t.textColor} drop-shadow-lg`}>
                      {t.title}
                    </span>
                    <span className="text-xs leading-tight text-white/70 drop-shadow sm:text-sm">
                      {t.desc}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground/60">
              You picked:{' '}
              <span className={selected === 'fantasy' ? 'text-violet-400' : 'text-rose-400'}>
                {selected === 'fantasy' ? 'Fantasy & Sci-Fi' : 'Modern & Realistic'}
              </span>
            </span>
            <button
              onClick={() => setSelected(null)}
              className="text-xs text-muted-foreground/40 underline hover:text-muted-foreground/60"
            >
              change
            </button>
          </div>
          <PreregisterForm themePreference={selected} />
        </>
      )}
    </div>
  );
}
