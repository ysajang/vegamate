import Link from 'next/link';

/**
 * Live-mode CTA: replaces the waitlist form once NEXT_PUBLIC_LAUNCH_MODE=live.
 * Routes to /login -> auth -> callback routes new users to /onboarding
 * (name -> age -> character -> first chat).
 */
export function LaunchCta() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/5 p-8 text-center backdrop-blur-sm">
      <h3 className="text-xl font-bold text-white sm:text-2xl">
        Your companion is waiting
      </h3>
      <p className="max-w-sm text-sm text-white/50">
        Pick a character and start chatting in under a minute. Free to start.
      </p>
      <Link
        href="/login"
        className="flex h-13 w-full max-w-xs items-center justify-center rounded-xl bg-gradient-to-r from-fuchsia-500 to-pink-500 px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-fuchsia-500/25 transition-transform hover:scale-[1.02] active:scale-[0.98]"
      >
        Start chatting
      </Link>
      <span className="text-xs text-white/30">No credit card required</span>
    </div>
  );
}
