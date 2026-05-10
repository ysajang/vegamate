'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';

type FormState = 'idle' | 'submitting' | 'success';

export function PreregisterForm() {
  const [email, setEmail] = useState('');
  const [willingToPay, setWillingToPay] = useState(false);
  const [state, setState] = useState<FormState>('idle');

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email.trim()) return;

      setState('submitting');

      try {
        const res = await fetch('/api/preregister', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim(),
            willing_to_pay: willingToPay,
            source: 'landing',
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
    [email, willingToPay]
  );

  if (state === 'success') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-8 text-center">
        <div className="text-4xl">✨</div>
        <h3 className="text-lg font-semibold">You&apos;re on the list!</h3>
        <p className="text-sm text-muted-foreground">
          We&apos;ll notify you when PRISM launches
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      <div className="flex flex-col gap-4 rounded-2xl border border-border/50 bg-card/50 p-6 backdrop-blur-sm">
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-semibold">Get Early Access</h3>
          <p className="text-sm text-muted-foreground">
            Be first to collect when we launch
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={state === 'submitting'}
            className="h-12 w-full rounded-lg border border-border bg-background px-4 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-violet-500 focus:ring-1 focus:ring-violet-500 disabled:opacity-50"
            required
          />

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/50 p-3 transition-colors hover:bg-accent/50">
            <input
              type="checkbox"
              checked={willingToPay}
              onChange={(e) => setWillingToPay(e.target.checked)}
              disabled={state === 'submitting'}
              className="mt-0.5 h-4 w-4 rounded border-border accent-violet-500"
            />
            <span className="text-sm text-muted-foreground">
              I&apos;d spend $5+ on premium gacha draws
            </span>
          </label>

          <button
            onClick={handleSubmit}
            disabled={state === 'submitting' || !email.trim()}
            className="h-12 w-full rounded-lg bg-violet-600 text-sm font-semibold text-white transition-all hover:bg-violet-500 disabled:opacity-50"
          >
            {state === 'submitting' ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Joining...
              </span>
            ) : (
              'Join the Waitlist'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
