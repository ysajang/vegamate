'use client';

import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export function SignOutButton() {
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    if (loading) return;
    setLoading(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } finally {
      // Full reload so server components/middleware pick up cleared cookies
      window.location.href = '/login';
    }
  }

  return (
    <button
      onClick={handleSignOut}
      disabled={loading}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border text-sm font-medium transition-opacity disabled:opacity-50"
      style={{
        borderColor: 'rgba(255,255,255,0.1)',
        background: 'var(--vm-card)',
        color: 'var(--vm-text-primary)',
      }}
    >
      {loading ? (
        <span
          className="size-4 animate-spin rounded-full border-2 border-t-transparent"
          style={{ borderColor: 'var(--vm-text-primary)', borderTopColor: 'transparent' }}
        />
      ) : (
        <LogOut className="size-4" />
      )}
      Sign out
    </button>
  );
}
