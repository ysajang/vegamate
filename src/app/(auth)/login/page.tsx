import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import { LoginForm } from './login-form';

/**
 * Server gate: if a session already exists, skip the login screen entirely.
 * - Onboarded users (display_name set) -> /select
 * - Authenticated but not onboarded -> /onboarding
 */
export default async function LoginPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single();

    redirect(profile?.display_name ? '/select' : '/onboarding');
  }

  return <LoginForm />;
}
