import { PreregisterForm } from '@/components/landing/preregister-form';
import { RarityShowcase } from '@/components/landing/rarity-showcase';
import { FeatureGrid } from '@/components/landing/feature-grid';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'VegaMate - AI Wallpaper Gacha',
  description:
    'Collect stunning AI-generated wallpapers through daily gacha draws. Draw rare and legendary anime-style pieces for your collection.',
  openGraph: {
    title: 'VegaMate - AI Wallpaper Gacha',
    description: 'Collect stunning AI-generated wallpapers through daily gacha draws.',
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
      <section className="flex w-full max-w-lg flex-col items-center gap-6 px-6 pb-8 pt-20">
        {/* Logo mark */}
        <div className="relative flex h-20 w-20 items-center justify-center">
          <div className="absolute inset-0 animate-pulse rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 opacity-20 blur-xl" />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 text-3xl font-bold text-white shadow-lg shadow-violet-500/25">
            P
          </div>
        </div>

        <div className="flex flex-col items-center gap-3 text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-amber-400 bg-clip-text text-transparent">
              VegaMate
            </span>
          </h1>
          <p className="text-lg text-muted-foreground">
            AI Wallpaper Gacha
          </p>
          <p className="max-w-xs text-sm leading-relaxed text-muted-foreground/80">
            Draw unique anime-style wallpapers every day. Build your collection. Chase the Legendary.
          </p>
        </div>
      </section>

      {/* Season 1 badge */}
      <section className="px-6 pb-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-pink-500/20 bg-pink-500/5 px-4 py-2">
          <span className="text-sm">🌸</span>
          <span className="text-xs font-medium text-pink-300">
            Season 1: Cherry Blossom Fantasy
          </span>
        </div>
      </section>

      {/* Rarity showcase */}
      <section className="w-full px-6 pb-10">
        <RarityShowcase />
      </section>

      {/* Features */}
      <section className="w-full px-6 pb-10">
        <FeatureGrid />
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
