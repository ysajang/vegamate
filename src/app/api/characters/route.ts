import { createServerSupabase } from '@/lib/supabase/server';
import { apiSuccess, withErrorHandler, AppError } from '@/lib/api-utils';

async function getHandler() {
  const supabase = await createServerSupabase();

  const { data: characters, error } = await supabase
    .from('characters')
    .select('id, slug, name, gender, greeting_message, avatar_url, personality_tags, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('[Characters] List error:', error);
    throw new AppError('Failed to load characters', 500);
  }

  return apiSuccess({ characters: characters || [] });
}

export const GET = withErrorHandler(getHandler);
