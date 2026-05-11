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

      {/* Hero — compact */}
      <section className="flex w-full max-w-lg flex-col items-center gap-3 px-6 pb-3 pt-10">
        <div className="relative flex h-14 w-14 items-center justify-center">
          <div className="absolute inset-0 animate-pulse rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 opacity-20 blur-lg" />
          <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 text-2xl font-bold text-white shadow-lg shadow-violet-500/25">
            V
          </div>
        </div>

        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-amber-400 bg-clip-text text-transparent">
            VegaMate
          </span>
        </h1>
        <p className="text-center text-sm font-medium text-muted-foreground">
          Meet Your AI Companion. Collect Their Exclusive Photos.
        </p>

        {/* Flow pills — inline */}
        <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
          <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-300">
            💬 Chat
          </span>
          <span className="text-xs text-muted-foreground/40">→</span>
          <span className="rounded-full bg-fuchsia-500/10 px-2 py-0.5 text-[11px] font-medium text-fuchsia-300">
            💕 Bond
          </span>
          <span className="text-xs text-muted-foreground/40">→</span>
          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
            🎰 Pull
          </span>
          <span className="text-xs text-muted-foreground/40">→</span>
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
            📸 Collect
          </span>
        </div>
      </section>

      {/* Features — tight 2x2 */}
      <section className="w-full px-6 pb-3 pt-2">
        <FeatureGrid />
      </section>

      {/* Rarity — compact list */}
      <section className="w-full px-6 pb-3">
        <RarityShowcase />
      </section>

      {/* Pre-register form with 18+ */}
      <section className="w-full px-6 pb-6" id="signup">
        <div className="flex flex-col items-center">
          <PreregisterForm />
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto w-full border-t border-border/30 py-4 text-center text-xs text-muted-foreground/60">
        © 2026 VegaMate. All rights reserved.
      </footer>
    </main>
  );
}
