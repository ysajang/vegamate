'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';

type FormState = 'idle' | 'submitting' | 'success';

export function PreregisterForm() {
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
            source: 'landing_v2_pivot',
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
    [email, willingToPay, ageConfirmed]
  );

  if (state === 'success') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-8 text-center">
        <div className="text-4xl">💜</div>
        <h3 className="text-lg font-semibold">You&apos;re on the list!</h3>
        <p className="text-sm text-muted-foreground">
          We&apos;ll notify you when VegaMate launches.
          <br />
          Your companions are waiting.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      <div className="flex flex-col gap-3 rounded-xl border border-border/50 bg-card/50 p-4 backdrop-blur-sm">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-sm font-semibold">Get Early Access</h3>
          <p className="text-xs text-muted-foreground">
            Be the first to meet your companion
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={state === 'submitting'}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-violet-500 focus:ring-1 focus:ring-violet-500 disabled:opacity-50"
            required
          />

          <label className="flex cursor-pointer items-center gap-2.5 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 transition-colors hover:bg-amber-500/10">
            <input
              type="checkbox"
              checked={ageConfirmed}
              onChange={(e) => setAgeConfirmed(e.target.checked)}
              disabled={state === 'submitting'}
              className="h-3.5 w-3.5 rounded border-border accent-amber-500"
            />
            <span className="text-xs text-amber-200/90">
              I confirm I am 18 years or older
            </span>
          </label>

          <label className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border/50 px-3 py-2 transition-colors hover:bg-accent/50">
            <input
              type="checkbox"
              checked={willingToPay}
              onChange={(e) => setWillingToPay(e.target.checked)}
              disabled={state === 'submitting'}
              className="h-3.5 w-3.5 rounded border-border accent-violet-500"
            />
            <span className="text-xs text-muted-foreground">
              I&apos;d pay $7.99+/mo for unlimited chat &amp; bonus gacha pulls
            </span>
          </label>

          <button
            onClick={handleSubmit}
            disabled={state === 'submitting' || !email.trim() || !ageConfirmed}
            className="h-10 w-full rounded-lg bg-violet-600 text-sm font-semibold text-white transition-all hover:bg-violet-500 disabled:opacity-50"
          >
            {state === 'submitting' ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Joining...
              </span>
            ) : (
              'Pre-register Now'
            )}
          </button>

          <p className="text-center text-[10px] text-muted-foreground/50">
            Contains suggestive content (bikini/lingerie). No nudity.
          </p>
        </div>
      </div>
    </div>
  );
}
