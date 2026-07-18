'use client';

import { createClient } from '@/lib/supabase/client';
import { APP_CONFIG } from '@/config/constants';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useState } from 'react';
import { Mail } from 'lucide-react';

function LoginContent() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const errorParam = searchParams.get('error');
  const [loading, setLoading] = useState<'google' | 'email' | null>(null);
  const [email, setEmail] = useState('');
  const [linkSent, setLinkSent] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const handleGoogle = useCallback(async () => {
    setLoading('google');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback`,
      },
    });
    if (error) {
      console.error('[OAuth Error]', error.message);
      setLoading(null);
    }
  }, [supabase]);

  const handleMagicLink = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = email.trim().toLowerCase();
      if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        setEmailError('Please enter a valid email address');
        return;
      }
      setEmailError(null);
      setLoading('email');

      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          emailRedirectTo: `${window.location.origin}/api/auth/callback`,
          // Sunset (2026-07-18): service is closed to new users. Magic links
          // are only issued for accounts that already exist.
          shouldCreateUser: false,
        },
      });

      setLoading(null);

      if (error) {
        console.error('[Magic Link Error]', error.message);
        // shouldCreateUser: false -> Supabase rejects unknown emails with
        // "Signups not allowed for otp" (422). Surface it as a closure notice.
        const signupsClosed =
          error.status === 422 || /signups? not allowed/i.test(error.message);
        setEmailError(
          error.status === 429
            ? 'Too many attempts. Please wait a minute and try again.'
            : signupsClosed
              ? 'VegaMate is closed to new signups. Existing accounts can still sign in.'
              : 'Could not send the link. Please try again.'
        );
        return;
      }

      setLinkSent(true);
    },
    [supabase, email]
  );

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 p-6">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-4xl font-bold tracking-tight">{APP_CONFIG.name}</h1>
        <p className="text-sm text-muted-foreground">
          Chat with companions who remember you
        </p>
      </div>

      {errorParam && (
        <p className="text-sm text-destructive">
          {errorParam === 'signups_closed'
            ? 'VegaMate is closed to new signups. Existing accounts can still sign in.'
            : 'Something went wrong. Please try again.'}
        </p>
      )}

      {linkSent ? (
        <div className="flex w-full max-w-xs flex-col items-center gap-3 rounded-xl border border-border bg-card p-6 text-center">
          <Mail className="size-8 text-muted-foreground" />
          <h2 className="text-base font-semibold">Check your email</h2>
          <p className="text-sm text-muted-foreground">
            We sent a sign-in link to{' '}
            <span className="font-medium text-foreground">{email.trim()}</span>. Open it on this
            device to continue.
          </p>
          <button
            onClick={() => setLinkSent(false)}
            className="text-xs text-muted-foreground underline underline-offset-2"
          >
            Use a different email
          </button>
        </div>
      ) : (
        <div className="flex w-full max-w-xs flex-col gap-3">
          <button
            onClick={handleGoogle}
            disabled={loading !== null}
            className="flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-border bg-card text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
          >
            {loading === 'google' ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
            )}
            Continue with Google
          </button>

          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleMagicLink} className="flex flex-col gap-2">
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading !== null}
              className="h-12 w-full rounded-lg border border-border bg-card px-4 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground/30 disabled:opacity-50"
            />
            {emailError && <p className="text-xs text-destructive">{emailError}</p>}
            <button
              type="submit"
              disabled={loading !== null}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
            >
              {loading === 'email' ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
              ) : (
                <Mail className="size-4" />
              )}
              Send sign-in link
            </button>
          </form>
        </div>
      )}

      <p className="max-w-xs text-center text-xs text-muted-foreground">
        By continuing you agree to our Terms of Service and Privacy Policy
      </p>
    </main>
  );
}

export function LoginForm() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
        </main>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
