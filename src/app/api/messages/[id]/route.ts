import { NextRequest } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiError, withErrorHandler, AppError } from '@/lib/api-utils';
import { checkRateLimit } from '@/lib/rate-limit';
import { sanitizeString, isValidUUID } from '@/lib/validators';

const MUTATION_RATE_LIMIT = { maxRequests: 30, windowSeconds: 60 };
const MAX_CONTENT_LENGTH = 2000;
const SELFIE_SELECT =
  '*, selfie:selfie_pool(id, image_url, thumbnail_url, rarity, scene, expression)';

interface EditHistoryEntry {
  content: string;
  edited_at: string;
}

/**
 * Authenticate the caller, fetch the target message, and verify the message
 * belongs to a conversation owned by the caller. Uses the service-role client
 * for reads/writes after the ownership check (same pattern as /api/chat).
 */
async function authorizeMessage(messageId: string) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new AppError('Unauthorized', 401);

  const service = createServiceRoleClient();

  const { data: message } = await service
    .from('messages')
    .select('id, conversation_id, role, content, created_at, deleted_at, edit_history')
    .eq('id', messageId)
    .single();

  if (!message) throw new AppError('Message not found', 404);

  // Confirm the conversation belongs to this user.
  const { data: conversation } = await service
    .from('conversations')
    .select('id')
    .eq('id', message.conversation_id)
    .eq('user_id', user.id)
    .single();

  // Don't leak existence of other users' messages.
  if (!conversation) throw new AppError('Message not found', 404);

  return { user, service, message };
}

// ── PATCH: edit a user message's content ─────────────────────
async function patchHandler(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id || !isValidUUID(id)) throw new AppError('Invalid message ID', 400);

  const { user, service, message } = await authorizeMessage(id);

  const rl = checkRateLimit(`msg-edit:${user.id}`, MUTATION_RATE_LIMIT);
  if (!rl.allowed) return apiError('Too many edits. Please slow down.', 429);

  if (message.deleted_at) throw new AppError('Cannot edit a deleted message', 400);
  if (message.role !== 'user') {
    throw new AppError('Only your own messages can be edited', 403);
  }

  const body = await req.json().catch(() => null);
  if (!body) throw new AppError('Invalid request body', 400);

  const newContent = sanitizeString(body.content);
  if (!newContent) throw new AppError('Message content is required', 400);
  if (newContent.length > MAX_CONTENT_LENGTH) {
    throw new AppError(`Message too long (max ${MAX_CONTENT_LENGTH} characters)`, 400);
  }

  // No-op if unchanged.
  if (newContent === message.content) {
    return apiSuccess({ message });
  }

  const now = new Date().toISOString();
  const history: EditHistoryEntry[] = Array.isArray(message.edit_history)
    ? (message.edit_history as EditHistoryEntry[])
    : [];
  // Append the previous version so the original wording is preserved (audit).
  const edit_history = [...history, { content: message.content, edited_at: now }];

  const { data: updated, error } = await service
    .from('messages')
    .update({ content: newContent, edited_at: now, edit_history })
    .eq('id', id)
    .select(SELFIE_SELECT)
    .single();

  if (error) {
    console.error('[Messages] Edit error:', error);
    throw new AppError('Failed to edit message', 500);
  }

  return apiSuccess({ message: updated });
}

// ── DELETE: soft-delete a user message + its paired AI reply ──
async function deleteHandler(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id || !isValidUUID(id)) throw new AppError('Invalid message ID', 400);

  const { user, service, message } = await authorizeMessage(id);

  const rl = checkRateLimit(`msg-del:${user.id}`, MUTATION_RATE_LIMIT);
  if (!rl.allowed) return apiError('Too many deletions. Please slow down.', 429);

  // Idempotent: already deleted → nothing to do.
  if (message.deleted_at) return apiSuccess({ deleted_ids: [] });

  if (message.role !== 'user') {
    throw new AppError('Only your own messages can be deleted', 403);
  }

  // The AI reply belonging to this turn is the assistant message(s) between this
  // user message and the NEXT (non-deleted) user message.
  const { data: nextUser } = await service
    .from('messages')
    .select('created_at')
    .eq('conversation_id', message.conversation_id)
    .eq('role', 'user')
    .is('deleted_at', null)
    .gt('created_at', message.created_at)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  let pairedQuery = service
    .from('messages')
    .select('id')
    .eq('conversation_id', message.conversation_id)
    .eq('role', 'assistant')
    .eq('is_proactive', false)
    .is('deleted_at', null)
    .gt('created_at', message.created_at);

  if (nextUser?.created_at) {
    pairedQuery = pairedQuery.lt('created_at', nextUser.created_at);
  }

  const { data: pairedAI } = await pairedQuery;
  const deleted_ids = [id, ...((pairedAI || []).map((m) => m.id))];

  const now = new Date().toISOString();
  const { error } = await service
    .from('messages')
    .update({ deleted_at: now })
    .in('id', deleted_ids);

  if (error) {
    console.error('[Messages] Delete error:', error);
    throw new AppError('Failed to delete message', 500);
  }

  return apiSuccess({ deleted_ids });
}

export const PATCH = withErrorHandler(patchHandler);
export const DELETE = withErrorHandler(deleteHandler);
