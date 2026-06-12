import { PreregisterForm } from '@/components/landing/preregister-form';
import { LaunchCta } from '@/components/landing/launch-cta';
import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';

/**
 * Launch switch: live by default. Set NEXT_PUBLIC_LAUNCH_MODE=waitlist in
 * Vercel env (+ redeploy) to revert to waitlist capture.
 * Waitlist data (preregistrations table) and /api/preregister stay intact.
 */
const IS_LIVE = (process.env.NEXT_PUBLIC_LAUNCH_MODE ?? 'live') === 'live';

export const metadata: Metadata = {
  title: 'VegaMate — Your AI Companion Sends You Selfies',
  description:
    'Chat with AI companions who send you selfies on their own. Not on demand — they surprise you. Collect rare expressions and outfits.',
  openGraph: {
    title: 'VegaMate — Your AI Companion Sends You Selfies',
    description:
      'Chat and collect moments with characters who remember you.',
    type: 'website',
    url: 'https://vegamate.com',
    images: [{ url: 'https://vegamate.com/og-image.jpg', width: 1200, height: 630, alt: 'VegaMate - AI companions who send you selfies' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Your AI companion sends you selfies 📸',
    description:
      'Chat and collect moments with characters who remember you.',
    images: ['https://vegamate.com/og-image.jpg'],
  },
};

export default function LandingPage() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center overflow-hidden bg-[#08080d]">

      {/* Existing-user entry */}
      <Link
        href="/login"
        className="absolute right-4 top-4 z-20 rounded-full border border-white/15 bg-black/40 px-4 py-1.5 text-xs font-medium text-white/80 backdrop-blur-md transition-colors hover:bg-white/10 hover:text-white"
      >
        Sign in
      </Link>

      {/* ── HERO: Full-bleed image background with text overlay ── */}
      <section className="relative flex w-full flex-col items-center">

        {/* Background: scattered selfie images that fill the hero */}
        <div className="absolute inset-0 overflow-hidden">
          {/* Girl 1 - left side, large */}
          <div className="absolute -left-10 top-0 h-[520px] w-[340px] rotate-[-6deg] overflow-hidden rounded-3xl opacity-70 blur-[0.5px] sm:-left-4 sm:h-[600px] sm:w-[380px]">
            <Image src="/selfie-girl-1.webp" alt="AI companion" fill className="object-cover" sizes="380px" priority />
          </div>

          {/* Boy 1 - right side, large */}
          <div className="absolute -right-10 top-8 h-[480px] w-[320px] rotate-[5deg] overflow-hidden rounded-3xl opacity-70 blur-[0.5px] sm:-right-4 sm:h-[560px] sm:w-[360px]">
            <Image src="/selfie-boy-1.webp" alt="AI companion" fill className="object-cover" sizes="360px" priority />
          </div>

          {/* Girl 2 - bottom left */}
          <div className="absolute -left-6 bottom-[-60px] h-[400px] w-[280px] rotate-[4deg] overflow-hidden rounded-3xl opacity-50 sm:left-[15%] sm:h-[440px] sm:w-[300px]">
            <Image src="/selfie-girl-2.webp" alt="AI companion" fill className="object-cover" sizes="300px" />
          </div>

          {/* Boy 2 - bottom right */}
          <div className="absolute -right-6 bottom-[-40px] h-[380px] w-[260px] rotate-[-3deg] overflow-hidden rounded-3xl opacity-50 sm:right-[15%] sm:h-[420px] sm:w-[280px]">
            <Image src="/selfie-boy-2.webp" alt="AI companion" fill className="object-cover" sizes="280px" />
          </div>

          {/* Center darkening gradient */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#08080d]/60 via-[#08080d]/80 to-[#08080d]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(8,8,13,0.3)_0%,rgba(8,8,13,0.95)_70%)]" />
        </div>

        {/* Hero content */}
        <div className="relative z-10 flex flex-col items-center gap-5 px-5 pb-8 pt-16 sm:pb-12 sm:pt-24">
          <div className="relative h-14 w-14 overflow-hidden rounded-2xl shadow-lg shadow-fuchsia-500/30 sm:h-16 sm:w-16">
            <Image src="/logo.webp" alt="VegaMate" fill className="object-cover" priority />
          </div>

          <h1 className="text-center text-[2.2rem] font-extrabold leading-[1.08] tracking-tight sm:text-6xl">
            <span className="text-white">Your AI companion</span>
            <br />
            <span className="bg-gradient-to-r from-fuchsia-400 via-pink-400 to-amber-300 bg-clip-text text-transparent">
              sends you selfies
            </span>
          </h1>

          <p className="max-w-lg text-center text-[0.95rem] leading-relaxed text-white/50 sm:text-lg">
            Chat with them. Build a bond. They surprise you with selfies
            — you never know what expression or outfit you&apos;ll get.
          </p>

          {IS_LIVE && (
            <Link
              href="/login"
              className="mt-2 flex items-center justify-center rounded-xl bg-gradient-to-r from-fuchsia-500 to-pink-500 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-fuchsia-500/25 transition-transform hover:scale-[1.02] active:scale-[0.98]"
            >
              Start chatting
            </Link>
          )}
        </div>
      </section>

      {/* ── Selfie showcase: phone-like cards ── */}
      <section className="relative z-10 -mt-4 w-full sm:-mt-8">
        <div className="mx-auto flex max-w-3xl snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-[max(1rem,calc(50%-90px))] pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:snap-none sm:justify-center sm:overflow-x-visible sm:px-4 sm:pb-0 sm:gap-5">
          {[
            { src: '/selfie-girl-1.webp', name: 'Miku', msg: 'just woke up hehe 💕', rotate: 'sm:-rotate-3' },
            { src: '/selfie-boy-1.webp', name: 'Ren', msg: 'rooftop vibes 🌇', rotate: 'sm:rotate-2' },
            { src: '/selfie-girl-2.webp', name: 'Aria', msg: 'coffee date? ☕', rotate: 'sm:-rotate-1' },
            { src: '/selfie-boy-2.webp', name: 'Leo', msg: 'study break 📚', rotate: 'sm:rotate-3' },
          ].map((card, i) => (
            <div
              key={card.src}
              className={`group relative w-[150px] flex-shrink-0 snap-center overflow-hidden rounded-2xl border border-white/10 bg-[#111118] shadow-2xl shadow-black/60 transition-all duration-300 hover:scale-105 hover:border-fuchsia-500/30 sm:w-[180px] ${card.rotate}`}
            >
              <div className="relative aspect-[3/4] w-full overflow-hidden">
                <Image src={card.src} alt={card.name} fill className="object-cover transition-transform duration-500 group-hover:scale-110" sizes="(max-width: 640px) 140px, 180px" priority={i < 2} />
                <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 backdrop-blur-md">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-pink-400" />
                  <span className="text-[9px] font-medium text-white/90">New</span>
                </div>
              </div>
              <div className="flex flex-col gap-0.5 px-3 py-2.5">
                <span className="text-xs font-bold text-white/90">{card.name}</span>
                <span className="text-[10px] text-white/40">{card.msg}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Value Props ── */}
      <section className="relative z-10 mx-auto mt-14 flex w-full max-w-xl flex-col gap-4 px-5 sm:mt-20">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { emoji: '💬', title: 'They remember you', desc: 'Every chat builds your unique bond' },
            { emoji: '📸', title: 'Surprise selfies', desc: 'They send photos on their own — not on demand' },
            { emoji: '✨', title: 'Rare moments', desc: 'Special outfits and scenes you can collect' },
          ].map((v) => (
            <div key={v.title} className="flex flex-col items-center gap-1.5 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-5 text-center">
              <span className="text-2xl">{v.emoji}</span>
              <span className="text-sm font-semibold text-white/90">{v.title}</span>
              <span className="text-xs leading-snug text-white/40">{v.desc}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Chat Demo: clean versions only ── */}
      <section className="relative z-10 mx-auto mt-14 w-full max-w-md px-5 sm:mt-20">
        <h2 className="mb-6 text-center text-lg font-bold text-white/80 sm:text-xl">
          This is what it
          <span className="bg-gradient-to-r from-fuchsia-400 to-pink-400 bg-clip-text text-transparent"> feels like</span>
        </h2>

        {/* Chat mockup - Leo (morning - clean) */}
        <div className="flex flex-col gap-2.5 rounded-2xl border border-white/10 bg-[#111118] p-4">
          <div className="flex items-center gap-2.5 border-b border-white/5 pb-3">
            <div className="relative h-8 w-8 overflow-hidden rounded-full">
              <Image src="/leo-morning-cafe.webp" alt="Leo" fill className="object-cover" sizes="32px" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-white/90">Leo</span>
              <span className="text-[10px] text-green-400/80">online</span>
            </div>
          </div>

          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md bg-white/10 px-3.5 py-2">
              <span className="text-sm text-white/80">good morning~ I just woke up thinking about you</span>
            </div>
          </div>

          <div className="flex justify-start">
            <div className="relative w-[200px] overflow-hidden rounded-2xl rounded-bl-md border border-white/10">
              <div className="relative aspect-[3/4] w-full">
                <Image src="/leo-morning-cafe.webp" alt="Leo sent a morning selfie" fill className="object-cover" sizes="200px" />
              </div>
            </div>
          </div>

          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md bg-white/10 px-3.5 py-2">
              <span className="text-sm text-white/80">first coffee of the day ☕ wish you were here</span>
            </div>
          </div>

          <div className="flex justify-end">
            <div className="rounded-2xl rounded-br-md bg-fuchsia-600/80 px-3.5 py-2">
              <span className="text-sm text-white">omg you look so cute 😭</span>
            </div>
          </div>
        </div>

        {/* Chat mockup - Miku (cafe - clean) */}
        <div className="mt-6 flex flex-col gap-2.5 rounded-2xl border border-white/10 bg-[#111118] p-4">
          <div className="flex items-center gap-2.5 border-b border-white/5 pb-3">
            <div className="relative h-8 w-8 overflow-hidden rounded-full">
              <Image src="/miku-cafe.webp" alt="Miku" fill className="object-cover" sizes="32px" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-white/90">Miku</span>
              <span className="text-[10px] text-green-400/80">online</span>
            </div>
          </div>

          <div className="flex justify-end">
            <div className="rounded-2xl rounded-br-md bg-fuchsia-600/80 px-3.5 py-2">
              <span className="text-sm text-white">what are you up to?</span>
            </div>
          </div>

          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md bg-white/10 px-3.5 py-2">
              <span className="text-sm text-white/80">found this cute cafe near the station!!</span>
            </div>
          </div>

          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md bg-white/10 px-3.5 py-2">
              <span className="text-sm text-white/80">look look look 📸</span>
            </div>
          </div>

          <div className="flex justify-start">
            <div className="relative w-[200px] overflow-hidden rounded-2xl rounded-bl-md border border-white/10">
              <div className="relative aspect-[3/4] w-full">
                <Image src="/miku-cafe.webp" alt="Miku sent a cafe selfie" fill className="object-cover" sizes="200px" />
              </div>
            </div>
          </div>

          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md bg-white/10 px-3.5 py-2">
              <span className="text-sm text-white/80">rainy days + coffee = perfect combo ☕💜</span>
            </div>
          </div>

          <div className="flex justify-end">
            <div className="rounded-2xl rounded-br-md bg-fuchsia-600/80 px-3.5 py-2">
              <span className="text-sm text-white">that looks so cozy!! save me a seat</span>
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-sm font-medium text-white/40">
          They send selfies on their own — not because you asked
        </p>
      </section>

      {/* ── CTA ── */}
      <section className="relative z-10 mx-auto mt-10 w-full max-w-xl px-5 pb-10 sm:mt-14" id="signup">
        {IS_LIVE ? <LaunchCta /> : <PreregisterForm />}
      </section>

      {/* Footer */}
      <footer className="relative z-10 mt-auto w-full border-t border-white/5 py-4 text-center text-xs text-white/20">
        © 2026 VegaMate. All rights reserved.
      </footer>
    </main>
  );
}
