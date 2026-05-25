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

const SELFIES = [
  { src: '/selfie-girl-1.webp', alt: 'Miku sent you a selfie from her room', rotate: '-3deg', z: 30 },
  { src: '/selfie-boy-2.webp', alt: 'Leo sent you a selfie from the library', rotate: '2.5deg', z: 20 },
  { src: '/selfie-girl-2.webp', alt: 'Aria sent you a selfie from a cafe', rotate: '-1.5deg', z: 40 },
  { src: '/selfie-boy-1.webp', alt: 'Ren sent you a selfie from the rooftop', rotate: '3deg', z: 10 },
];

export default function LandingPage() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center overflow-hidden bg-[#0a0a0f]">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-[700px] w-[700px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-fuchsia-600/8 blur-[150px]" />
        <div className="absolute bottom-0 right-0 h-[500px] w-[500px] translate-x-1/4 translate-y-1/4 rounded-full bg-violet-600/6 blur-[120px]" />
      </div>

      {/* ── Hero ── */}
      <section className="flex w-full max-w-3xl flex-col items-center gap-5 px-5 pt-14 sm:pt-20">
        {/* Logo */}
        <div className="relative h-14 w-14 overflow-hidden rounded-2xl shadow-lg shadow-fuchsia-500/20 sm:h-16 sm:w-16">
          <Image src="/logo.webp" alt="VegaMate" fill className="object-cover" priority />
        </div>

        {/* Headline */}
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-[2rem] font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
            <span className="text-white">Your AI companion</span>
            <br />
            <span className="bg-gradient-to-r from-fuchsia-400 via-pink-400 to-amber-300 bg-clip-text text-transparent">
              sends you selfies
            </span>
          </h1>
          <p className="max-w-md text-[0.95rem] leading-relaxed text-white/50 sm:text-base">
            Chat with them. Build a bond. They surprise you with selfies
            — you never know what expression or outfit you&apos;ll get.
          </p>
        </div>
      </section>

      {/* ── Selfie Gallery ── */}
      <section className="relative mx-auto mt-10 flex w-full max-w-2xl justify-center px-4 sm:mt-14">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {SELFIES.map((s, i) => (
            <div
              key={s.src}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-xl shadow-black/40 transition-all duration-300 hover:scale-[1.04] hover:border-fuchsia-400/30 hover:shadow-fuchsia-500/10"
              style={{ transform: `rotate(${s.rotate})`, zIndex: s.z, animationDelay: `${i * 100}ms` }}
            >
              <div className="relative aspect-[3/4] w-full">
                <Image
                  src={s.src}
                  alt={s.alt}
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-110"
                  sizes="(max-width: 640px) 45vw, 160px"
                  priority={i < 2}
                />
                {/* Notification pill */}
                <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 backdrop-blur-md">
                  <span className="h-1.5 w-1.5 rounded-full bg-pink-400 animate-pulse" />
                  <span className="text-[10px] font-medium text-white/90">New selfie</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Value Props ── */}
      <section className="mx-auto mt-12 flex w-full max-w-xl flex-col gap-4 px-5 sm:mt-16">
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
      <section className="mx-auto mt-10 w-full max-w-xl px-5 pb-10 sm:mt-14" id="signup">
        <PreregisterForm />
      </section>

      {/* Footer */}
      <footer className="mt-auto w-full border-t border-white/5 py-4 text-center text-xs text-white/20">
        © 2026 VegaMate. All rights reserved.
      </footer>
    </main>
  );
}
