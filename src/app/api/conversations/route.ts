import { NextRequest } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiError, withErrorHandler, AppError } from '@/lib/api-utils';
import { sanitizeString, isValidUUID } from '@/lib/validators';

// GET /api/conversations -> list user's conversations with character data
async function getHandler(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const { data: conversations, error } = await supabase
    .from('conversations')
    .select('*, character:characters(*)')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('last_message_at', { ascending: false, nullsFirst: false });

  if (error) {
    console.error('[Conversations] List error:', error);
    throw new AppError('Failed to load conversations', 500);
  }

  return apiSuccess({ conversations: conversations || [] });
}

// POST /api/conversations -> start conversation with a character
async function postHandler(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    throw new AppError('Invalid request body');
  }

  const characterId = sanitizeString(body.character_id);
  if (!characterId || !isValidUUID(characterId)) {
    throw new AppError('Invalid character_id');
  }

  const serviceClient = createServiceRoleClient();

  // Verify character exists and is active
  const { data: character, error: charError } = await serviceClient
    .from('characters')
    .select('*')
    .eq('id', characterId)
    .eq('is_active', true)
    .single();

  if (charError || !character) {
    throw new AppError('Character not found', 404);
  }

  // Check if conversation already exists (upsert pattern)
  const { data: existing } = await serviceClient
    .from('conversations')
    .select('*, character:characters(*)')
    .eq('user_id', user.id)
    .eq('character_id', characterId)
    .single();

  if (existing) {
    // Reactivate if was deactivated
    if (!existing.is_active) {
      await serviceClient
        .from('conversations')
        .update({ is_active: true })
        .eq('id', existing.id);
      existing.is_active = true;
    }
    return apiSuccess({ conversation: existing, is_new: false });
  }

  // Create new conversation
  const { data: newConversation, error: createError } = await serviceClient
    .from('conversations')
    .insert({
      user_id: user.id,
      character_id: characterId,
    })
    .select('*, character:characters(*)')
    .single();

  if (createError || !newConversation) {
    console.error('[Conversations] Create error:', createError);
    throw new AppError('Failed to start conversation', 500);
  }

  // Insert greeting message from character (free - no credits)
  await serviceClient.from('messages').insert({
    conversation_id: newConversation.id,
    role: 'assistant',
    content_type: 'text',
    content: character.greeting_message,
    credits_consumed: 0,
    metadata: { is_greeting: true },
  });

  // Update conversation stats
  await serviceClient
    .from('conversations')
    .update({
      message_count: 1,
      last_message_at: new Date().toISOString(),
    })
    .eq('id', newConversation.id);

  return apiSuccess({ conversation: newConversation, is_new: true }, 201);
}

export const GET = withErrorHandler(getHandler);
export const POST = withErrorHandler(postHandler);
