import { PreregisterForm } from '@/components/landing/preregister-form';
import { RarityShowcase } from '@/components/landing/rarity-showcase';
import { FeatureGrid } from '@/components/landing/feature-grid';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'VegaMate - AI Companion Gacha',
  description:
    'Chat with stunning AI companions. Build intimacy. Pull gacha for their exclusive wallpapers. Male & female characters available.',
  openGraph: {
    title: 'VegaMate - AI Companion Gacha',
    description: 'Chat with AI companions, collect their exclusive photos through gacha pulls.',
    type: 'website',
  },
};

export default function LandingPage() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center overflow-hidden">
      {/* Background effects */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-600/10 blur-[120px]" />
        <div className="absolute bottom-0 left-0 h-[400px] w-[400px] -translate-x-1/2 translate-y-1/2 rounded-full bg-fuchsia-600/8 blur-[100px]" />
        <div className="absolute right-0 top-1/2 h-[300px] w-[300px] translate-x-1/2 rounded-full bg-amber-500/5 blur-[80px]" />
      </div>

      {/* Hero */}
      <section className="flex w-full max-w-lg flex-col items-center gap-6 px-6 pb-6 pt-20">
        {/* Logo mark */}
        <div className="relative flex h-20 w-20 items-center justify-center">
          <div className="absolute inset-0 animate-pulse rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 opacity-20 blur-xl" />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 text-3xl font-bold text-white shadow-lg shadow-violet-500/25">
            V
          </div>
        </div>

        <div className="flex flex-col items-center gap-3 text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-amber-400 bg-clip-text text-transparent">
              VegaMate
            </span>
          </h1>
          <p className="text-lg font-medium text-muted-foreground">
            Meet Your AI Companion.
            <br />
            Collect Their Exclusive Photos.
          </p>
          <p className="max-w-xs text-sm leading-relaxed text-muted-foreground/80">
            Chat with stunning AI characters. Build intimacy.
            Pull gacha for their exclusive wallpapers —
            from casual selfies to breathtaking shots.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 pb-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground/70">
          <span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-violet-300">
            💬 Chat
          </span>
          <span className="text-muted-foreground/40">→</span>
          <span className="rounded-full bg-fuchsia-500/10 px-2.5 py-1 text-xs font-medium text-fuchsia-300">
            💕 Bond
          </span>
          <span className="text-muted-foreground/40">→</span>
          <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-300">
            🎰 Pull
          </span>
          <span className="text-muted-foreground/40">→</span>
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
            📸 Collect
          </span>
        </div>
      </section>

      {/* Characters preview placeholder */}
      <section className="w-full px-6 pb-8">
        <div className="mx-auto flex max-w-md flex-col items-center gap-3">
          <h3 className="text-sm font-semibold text-muted-foreground">
            6 Characters at Launch
          </h3>
          <div className="grid w-full grid-cols-6 gap-2">
            {['👩‍🦰', '👨', '👩', '👨‍🦱', '👩‍🦳', '👨‍🦰'].map((emoji, i) => (
              <div
                key={i}
                className="flex aspect-square items-center justify-center rounded-xl border border-border/30 bg-card/30 text-2xl backdrop-blur-sm"
              >
                {emoji}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground/60">
            3 female + 3 male — more every season
          </p>
        </div>
      </section>

      {/* Rarity showcase */}
      <section className="w-full px-6 pb-8">
        <RarityShowcase />
      </section>

      {/* Features */}
      <section className="w-full px-6 pb-10">
        <FeatureGrid />
      </section>

      {/* 18+ notice */}
      <section className="px-6 pb-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/5 px-4 py-2">
          <span className="text-sm">🔞</span>
          <span className="text-xs font-medium text-amber-300">
            18+ Only — Contains suggestive content
          </span>
        </div>
      </section>

      {/* Pre-register form */}
      <section className="w-full px-6 pb-16" id="signup">
        <div className="flex flex-col items-center">
          <PreregisterForm />
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full border-t border-border/30 py-6 text-center text-xs text-muted-foreground/60">
        © 2026 VegaMate. All rights reserved.
      </footer>
    </main>
  );
}
