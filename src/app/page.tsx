import { PreregisterForm } from '@/components/landing/preregister-form';
import Image from 'next/image';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'VegaMate — Your AI Companion Sends You Selfies',
  description:
    'Chat with AI companions who remember you. They send you selfies — you never know what you will get. Collect rare expressions and outfits.',
  openGraph: {
    title: 'VegaMate — Your AI Companion Sends You Selfies',
    description:
      'Chat with AI companions who remember you. They send you selfies — you never know what you will get.',
    type: 'website',
    url: 'https://vegamate.com',
    images: [{ url: 'https://vegamate.com/og-image.jpg', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VegaMate — Your AI Companion Sends You Selfies',
    description:
      'Chat with AI companions who remember you. They send you selfies — you never know what you will get.',
    images: ['https://vegamate.com/og-image.jpg'],
  },
};

export default function LandingPage() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center overflow-hidden bg-[#08080d]">

      {/* ── HERO: Full-bleed image background with text overlay ── */}
      <section className="relative flex w-full flex-col items-center">

        {/* Background: scattered selfie images that fill the hero */}
        <div className="absolute inset-0 overflow-hidden">
          {/* Girl 1 - left side, large */}
          <div className="absolute -left-10 top-0 h-[520px] w-[340px] rotate-[-6deg] overflow-hidden rounded-3xl opacity-70 blur-[0.5px] sm:-left-4 sm:h-[600px] sm:w-[380px]">
            <Image
              src="/selfie-girl-1.webp"
              alt="AI companion selfie"
              fill
              className="object-cover"
              sizes="380px"
              priority
            />
          </div>

          {/* Boy 1 - right side, large */}
          <div className="absolute -right-10 top-8 h-[480px] w-[320px] rotate-[5deg] overflow-hidden rounded-3xl opacity-70 blur-[0.5px] sm:-right-4 sm:h-[560px] sm:w-[360px]">
            <Image
              src="/selfie-boy-1.webp"
              alt="AI companion selfie"
              fill
              className="object-cover"
              sizes="360px"
              priority
            />
          </div>

          {/* Girl 2 - bottom left */}
          <div className="absolute -left-6 bottom-[-60px] h-[400px] w-[280px] rotate-[4deg] overflow-hidden rounded-3xl opacity-50 sm:left-[15%] sm:h-[440px] sm:w-[300px]">
            <Image
              src="/selfie-girl-2.webp"
              alt="AI companion selfie"
              fill
              className="object-cover"
              sizes="300px"
            />
          </div>

          {/* Boy 2 - bottom right */}
          <div className="absolute -right-6 bottom-[-40px] h-[380px] w-[260px] rotate-[-3deg] overflow-hidden rounded-3xl opacity-50 sm:right-[15%] sm:h-[420px] sm:w-[280px]">
            <Image
              src="/selfie-boy-2.webp"
              alt="AI companion selfie"
              fill
              className="object-cover"
              sizes="280px"
            />
          </div>

          {/* Center darkening gradient so text is readable */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#08080d]/60 via-[#08080d]/80 to-[#08080d]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(8,8,13,0.3)_0%,rgba(8,8,13,0.95)_70%)]" />
        </div>

        {/* Hero content - on top of images */}
        <div className="relative z-10 flex flex-col items-center gap-5 px-5 pb-8 pt-16 sm:pb-12 sm:pt-24">
          {/* Logo */}
          <div className="relative h-14 w-14 overflow-hidden rounded-2xl shadow-lg shadow-fuchsia-500/30 sm:h-16 sm:w-16">
            <Image src="/logo.webp" alt="VegaMate" fill className="object-cover" priority />
          </div>

          {/* Headline */}
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
        </div>
      </section>

      {/* ── Selfie showcase: phone-like cards ── */}
      <section className="relative z-10 -mt-4 w-full px-4 sm:-mt-8">
        <div className="mx-auto flex max-w-3xl justify-center gap-3 sm:gap-5">
          {[
            { src: '/selfie-girl-1.webp', name: 'Miku', msg: 'just woke up hehe 💕', rotate: '-4deg' },
            { src: '/selfie-boy-1.webp', name: 'Ren', msg: 'rooftop vibes 🌇', rotate: '2deg' },
            { src: '/selfie-girl-2.webp', name: 'Aria', msg: 'coffee date? ☕', rotate: '-1deg' },
            { src: '/selfie-boy-2.webp', name: 'Leo', msg: 'study break 📚', rotate: '3deg' },
          ].map((card, i) => (
            <div
              key={card.src}
              className="group relative w-[140px] flex-shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-[#111118] shadow-2xl shadow-black/60 transition-all duration-300 hover:scale-105 hover:border-fuchsia-500/30 sm:w-[180px]"
              style={{ transform: `rotate(${card.rotate})` }}
            >
              {/* Image */}
              <div className="relative aspect-[3/4] w-full overflow-hidden">
                <Image
                  src={card.src}
                  alt={card.name}
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-110"
                  sizes="(max-width: 640px) 140px, 180px"
                  priority={i < 2}
                />
                {/* Notification dot */}
                <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 backdrop-blur-md">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-pink-400" />
                  <span className="text-[9px] font-medium text-white/90">New</span>
                </div>
              </div>
              {/* Chat bubble */}
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
            { emoji: '📸', title: 'Surprise selfies', desc: 'Random expressions and outfits you collect' },
            { emoji: '✨', title: 'Rare moments', desc: 'Special outfits and scenes drop at low rates' },
          ].map((v) => (
            <div
              key={v.title}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-5 text-center"
            >
              <span className="text-2xl">{v.emoji}</span>
              <span className="text-sm font-semibold text-white/90">{v.title}</span>
              <span className="text-xs leading-snug text-white/40">{v.desc}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative z-10 mx-auto mt-10 w-full max-w-xl px-5 pb-10 sm:mt-14" id="signup">
        <PreregisterForm />
      </section>

      {/* Footer */}
      <footer className="relative z-10 mt-auto w-full border-t border-white/5 py-4 text-center text-xs text-white/20">
        © 2026 VegaMate. All rights reserved.
      </footer>
    </main>
  );
}
