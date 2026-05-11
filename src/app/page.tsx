import { ThemeSelector } from '@/components/landing/theme-selector';
import Image from 'next/image';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'VegaMate - Companion Gacha',
  description:
    'Chat with stunning anime companions. Build intimacy. Pull gacha for their exclusive wallpapers. Male & female characters available.',
  openGraph: {
    title: 'VegaMate - Companion Gacha',
    description: 'Chat with anime companions, collect their exclusive photos through gacha pulls.',
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
      <section className="flex w-full max-w-2xl flex-col items-center gap-3 px-6 pb-4 pt-12 sm:gap-4 sm:pt-16">
        <div className="relative h-16 w-16 overflow-hidden rounded-2xl shadow-lg shadow-violet-500/25 sm:h-20 sm:w-20">
          <Image
            src="/logo.webp"
            alt="VegaMate"
            fill
            className="object-cover"
            priority
          />
        </div>

        <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
          <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-amber-400 bg-clip-text text-transparent">
            VegaMate
          </span>
        </h1>
        <p className="text-center text-base font-medium text-muted-foreground sm:text-lg">
          Companion Gacha — Chat, Bond, Collect
        </p>
        <div className="flex max-w-lg flex-col items-center gap-1 text-center text-sm text-muted-foreground/60 sm:text-base">
          <p>Chat with anime characters who remember you</p>
          <p>Pull gacha for their exclusive photos — casual to stunning</p>
          <p>Male &amp; female companions available</p>
        </div>
      </section>

      {/* Theme A/B selector -> Pre-register */}
      <section className="w-full px-6 pb-8 pt-2 sm:pt-4" id="signup">
        <ThemeSelector />
      </section>

      {/* Footer */}
      <footer className="mt-auto w-full border-t border-border/30 py-4 text-center text-xs text-muted-foreground/60">
        © 2026 VegaMate. All rights reserved.
      </footer>
    </main>
  );
}
