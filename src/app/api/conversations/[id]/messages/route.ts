import { NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { apiSuccess, withErrorHandler, AppError } from '@/lib/api-utils';
import { isValidUUID } from '@/lib/validators';

async function getHandler(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: conversationId } = await params;

  if (!conversationId || !isValidUUID(conversationId)) {
    throw new AppError('Invalid conversation ID', 400);
  }

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  // Verify conversation belongs to user
  const { data: conversation } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('user_id', user.id)
    .single();

  if (!conversation) {
    throw new AppError('Conversation not found', 404);
  }

  // Pagination
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);
  const before = url.searchParams.get('before'); // cursor: created_at ISO string

  // Fetch the LATEST `limit` messages, not the oldest. Ordering ascending with
  // a limit returned the oldest 50 and hid recent messages once a conversation
  // grew past the limit. We order descending (newest first), then reverse for
  // the client so the array is chronological (oldest → newest).
  let query = supabase
    .from('messages')
    .select('*, selfie:selfie_pool(id, image_url, thumbnail_url, rarity, scene, expression)')
    .eq('conversation_id', conversationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (before) {
    // Load an older page: messages strictly before the given cursor.
    query = query.lt('created_at', before);
  }

  const { data: rows, error } = await query;

  if (error) {
    console.error('[Messages] Load error:', error);
    throw new AppError('Failed to load messages', 500);
  }

  const hasMore = (rows?.length || 0) === limit;
  // Reverse the newest-first page into chronological order for rendering.
  const messages = (rows || []).slice().reverse();

  return apiSuccess({
    messages,
    has_more: hasMore,
  });
}

export const GET = withErrorHandler(getHandler);
