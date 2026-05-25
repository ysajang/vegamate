'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';

type FormState = 'idle' | 'submitting' | 'success';

export function PreregisterForm({ themePreference }: { themePreference?: string }) {
  const [email, setEmail] = useState('');
  const [willingToPay, setWillingToPay] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [state, setState] = useState<FormState>('idle');

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email.trim()) return;

      if (!ageConfirmed) {
        toast.error('You must confirm you are 18 or older');
        return;
      }

      setState('submitting');

      try {
        const res = await fetch('/api/preregister', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim(),
            willing_to_pay: willingToPay,
            source: 'landing_v3_selfie',
            theme_preference: themePreference || null,
          }),
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
          toast.error(data.error || 'Something went wrong');
          setState('idle');
          return;
        }

        setState('success');
        toast.success("You're on the list!");
      } catch {
        toast.error('Network error. Please try again.');
        setState('idle');
      }
    },
    [email, willingToPay, ageConfirmed, themePreference]
  );

  if (state === 'success') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/5 p-8 text-center backdrop-blur-sm">
        <div className="text-4xl">📸</div>
        <h3 className="text-lg font-semibold text-white">You&apos;re on the list!</h3>
        <p className="text-sm text-white/50">
          We&apos;ll notify you when VegaMate launches.
          <br />
          Your companions are getting ready to take their first selfie for you.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex flex-col gap-3.5 rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm">
        <div className="flex flex-col gap-0.5 text-center">
          <h3 className="text-base font-bold text-white">Get Early Access</h3>
          <p className="text-xs text-white/40">
            Be first to chat with your companion and receive their selfies
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          <input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={state === 'submitting'}
            className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white outline-none transition-colors placeholder:text-white/25 focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/30 disabled:opacity-50"
            required
          />

          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-amber-400/15 bg-amber-400/5 px-3 py-2.5 transition-colors hover:bg-amber-400/10">
            <input
              type="checkbox"
              checked={ageConfirmed}
              onChange={(e) => setAgeConfirmed(e.target.checked)}
              disabled={state === 'submitting'}
              className="h-4 w-4 rounded border-white/20 accent-amber-400"
            />
            <span className="text-xs text-amber-200/80">
              I confirm I am 18 years or older
            </span>
          </label>

          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5 transition-colors hover:bg-white/[0.04]">
            <input
              type="checkbox"
              checked={willingToPay}
              onChange={(e) => setWillingToPay(e.target.checked)}
              disabled={state === 'submitting'}
              className="h-4 w-4 rounded border-white/20 accent-fuchsia-500"
            />
            <span className="text-xs text-white/50">
              I&apos;d pay $7.99+/mo for unlimited chat &amp; bonus selfie pulls
            </span>
          </label>

          <button
            onClick={handleSubmit}
            disabled={state === 'submitting' || !email.trim() || !ageConfirmed}
            className="h-11 w-full rounded-xl bg-gradient-to-r from-fuchsia-600 to-pink-600 text-sm font-bold text-white shadow-lg shadow-fuchsia-500/20 transition-all hover:shadow-fuchsia-500/30 hover:brightness-110 active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
          >
            {state === 'submitting' ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Joining...
              </span>
            ) : (
              'Get Early Access'
            )}
          </button>

          <p className="text-center text-[10px] text-white/20">
            Contains suggestive content (bikini/lingerie). No nudity.
          </p>
        </div>
      </div>
    </div>
  );
}
