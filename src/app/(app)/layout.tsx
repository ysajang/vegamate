import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import { AppInitializer } from '@/components/common';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div
      className="mx-auto h-dvh w-full max-w-[428px] overflow-hidden"
      style={{
        boxShadow: '0 0 80px rgba(59, 7, 100, 0.15)',
      }}
    >
      <AppInitializer />
      {children}
    </div>
  );
}
