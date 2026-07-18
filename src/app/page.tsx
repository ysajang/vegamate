import type { Metadata } from 'next';

/**
 * Sunset notice (2026-07-18). VegaMate is discontinued.
 * Static page only — no Supabase, no client JS. Backend (Supabase) is
 * paused, so every interactive route is dead; middleware funnels all
 * traffic here.
 */
export const metadata: Metadata = {
  title: 'VegaMate — Service Ended',
  description: 'VegaMate has been discontinued.',
  robots: { index: false, follow: false },
};

export default function SunsetPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="text-4xl font-bold tracking-tight">VegaMate</h1>

      <div className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-border bg-card p-8">
        <h2 className="text-lg font-semibold">
          VegaMate has shut down
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          As of July 18, 2026, VegaMate is no longer available. Sign-in,
          chat, and all other features have been permanently disabled.
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          No payments were ever charged to any account, so there is
          nothing you need to do. All personal data will be deleted in
          accordance with our privacy policy.
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Thank you for trying VegaMate.
        </p>
      </div>

      <p className="text-xs text-muted-foreground">
        Questions: contact@makiful.com
      </p>
    </main>
  );
}
