import { NextRequest } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, withErrorHandler, AppError } from '@/lib/api-utils';

async function handler(_req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const serviceClient = createServiceRoleClient();

  const { data: gifts, error } = await serviceClient
    .from('gifts')
    .select('id, slug, name, emoji, price_usd, is_requestable, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('[Gifts] Failed to fetch gifts:', error);
    throw new AppError('Failed to load gifts', 500);
  }

  return apiSuccess({ gifts: gifts || [] });
}

export const GET = withErrorHandler(handler);
