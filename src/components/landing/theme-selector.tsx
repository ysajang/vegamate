'use client';

import { useState } from 'react';
import { PreregisterForm } from './preregister-form';

type Theme = 'fantasy' | 'modern' | null;

const THEMES = [
  {
    id: 'fantasy' as const,
    title: 'Fantasy & Sci-Fi',
    desc: 'Space elves, star pilots, mage warriors, cybernetic angels',
    visual: '🌌',
    gradient: 'from-violet-500/20 to-cyan-500/20',
    border: 'border-violet-500/30',
    hoverBorder: 'hover:border-violet-400/60',
    textColor: 'text-violet-300',
  },
  {
    id: 'modern' as const,
    title: 'Modern & Realistic',
    desc: 'College students, baristas, fitness trainers, office workers',
    visual: '🏙️',
    gradient: 'from-rose-500/20 to-amber-500/20',
    border: 'border-rose-500/30',
    hoverBorder: 'hover:border-rose-400/60',
    textColor: 'text-rose-300',
  },
];

export function ThemeSelector() {
  const [selected, setSelected] = useState<Theme>(null);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3">
      {!selected ? (
        <>
          <h3 className="text-center text-sm font-semibold text-muted-foreground">
            Which characters would you spend on?
          </h3>
          <div className="grid w-full grid-cols-2 gap-2">
            {THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelected(t.id)}
                className={`group flex flex-col items-center gap-2 rounded-xl border ${t.border} ${t.hoverBorder} bg-gradient-to-br ${t.gradient} p-4 text-center transition-all hover:scale-[1.02] active:scale-[0.98]`}
              >
                <span className="text-3xl">{t.visual}</span>
                <span className={`text-sm font-bold ${t.textColor}`}>
                  {t.title}
                </span>
                <span className="text-[11px] leading-tight text-muted-foreground/70">
                  {t.desc}
                </span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground/60">
              You picked:{' '}
              <span className={selected === 'fantasy' ? 'text-violet-400' : 'text-rose-400'}>
                {selected === 'fantasy' ? '🌌 Fantasy & Sci-Fi' : '🏙️ Modern & Realistic'}
              </span>
            </span>
            <button
              onClick={() => setSelected(null)}
              className="text-[10px] text-muted-foreground/40 underline hover:text-muted-foreground/60"
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
