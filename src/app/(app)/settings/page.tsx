import { createServerSupabase } from '@/lib/supabase/server';
import { BottomNav } from '@/components/common';
import { SignOutButton } from './sign-out-button';

export const metadata = { title: 'Settings — VegaMate' };

export default async function SettingsPage() {
  // (app)/layout.tsx already guards auth; user is guaranteed here
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user!.id)
    .single();

  const provider = user?.app_metadata?.provider ?? 'email';

  return (
    <main className="flex h-dvh flex-col" style={{ background: 'var(--vm-base)' }}>
      <header className="px-6 pb-2 pt-6">
        <h1 className="text-xl font-bold" style={{ color: 'var(--vm-text-primary)' }}>
          Settings
        </h1>
      </header>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
        {/* Account card -> makes login state visible */}
        <section
          className="flex flex-col gap-1 rounded-xl border p-4"
          style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'var(--vm-card)' }}
        >
          <span className="text-xs" style={{ color: 'var(--vm-text-tertiary)' }}>
            Signed in as
          </span>
          <span
            className="truncate text-sm font-semibold"
            style={{ color: 'var(--vm-text-primary)' }}
          >
            {profile?.display_name || user?.email}
          </span>
          {profile?.display_name && (
            <span className="truncate text-xs" style={{ color: 'var(--vm-text-tertiary)' }}>
              {user?.email}
            </span>
          )}
          <span className="mt-1 text-[11px] capitalize" style={{ color: 'var(--vm-text-tertiary)' }}>
            via {provider}
          </span>
        </section>

        <SignOutButton />
      </div>

      <BottomNav />
    </main>
  );
}
