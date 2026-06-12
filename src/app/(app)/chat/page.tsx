import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * /chat index (BottomNav target). No conversation list screen exists yet,
 * so route to the most recent conversation, or /select if none.
 */
export default async function ChatIndexPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: conversation } = await supabase
    .from('conversations')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  redirect(conversation ? `/chat/${conversation.id}` : '/select');
}
