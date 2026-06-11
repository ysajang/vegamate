import { createServerClient } from '@supabase/ssr';
import type { EmailOtpType } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

/**
 * Auth callback for both flows:
 * - OAuth / PKCE magic link: ?code=...           -> exchangeCodeForSession
 * - Magic link (token_hash template): ?token_hash=...&type=email -> verifyOtp
 *
 * After session creation, route based on onboarding state:
 * onboarded (display_name set) -> /select, otherwise -> /onboarding
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const otpType = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next');

  if (!code && !tokenHash) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const cookieStore = await cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(`${origin}/login?error=config`);
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Ignored
        }
      },
    },
  });

  let authError: { message: string } | null = null;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    authError = error;
  } else if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({
      type: otpType ?? 'email',
      token_hash: tokenHash,
    });
    authError = error;
  }

  if (authError) {
    console.error('[Auth Callback Error]', authError.message);
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  // Explicit next param wins (used by deep links)
  if (next) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  // Route by onboarding state
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single();

    return NextResponse.redirect(
      `${origin}${profile?.display_name ? '/select' : '/onboarding'}`
    );
  }

  return NextResponse.redirect(`${origin}/select`);
}
