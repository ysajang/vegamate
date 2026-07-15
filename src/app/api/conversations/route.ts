import { NextRequest } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiError, withErrorHandler, AppError } from '@/lib/api-utils';
import { sanitizeString, isValidUUID } from '@/lib/validators';
import { assertAgeVerified } from '@/lib/auth/age-guard';
import { pickGreeting } from '@/lib/chat/greeting';
import { planGreetingSelfie, type GreetingSelfieCandidate } from '@/lib/chat/greeting-selfie';

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

  // Viewer's timezone for client-side message timestamp rendering.
  // 메시지 버블 시각을 브라우저 로컬이 아닌 profiles.timezone 기준으로 렌더하기 위함.
  const { data: tzProfile } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', user.id)
    .single();

  return apiSuccess({
    conversations: conversations || [],
    timezone: tzProfile?.timezone ?? null,
  });
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

  // Age gate at the data-access layer: block conversation creation for
  // non-verified users so the gate holds even when the onboarding UI is
  // skipped via direct navigation. Defense-in-depth with the same check in
  // /api/chat.
  await assertAgeVerified(serviceClient, user.id);

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
  // 유저 선호 언어로 첫 인사 선택. greeting_i18n[lang] -> en -> greeting_message 폴백.
  const { data: greetProfile } = await serviceClient
    .from('profiles')
    .select('preferred_language')
    .eq('id', user.id)
    .single();

  const greetingText = pickGreeting(
    character.greeting_i18n,
    greetProfile?.preferred_language,
    character.greeting_message
  );

  // Greeting selfie (Notion §34): the FIRST screen proves selfie+chat with
  // zero clicks. Attached only when this is the user's first selfie ever —
  // it consumes the selfie-economy lifetime unblurred freebie, so later chat
  // selfies arrive as blurred monetization cards. Best-effort: any failure
  // here degrades to the plain text greeting, never blocks creation. The
  // chat-route session cap / frequency guards intentionally do not apply.
  let greetingSelfie: GreetingSelfieCandidate | null = null;
  let lifetimeSelfieCount = 1; // safe default: no freebie unless verified 0
  try {
    const { count: collectionCount } = await serviceClient
      .from('user_selfie_collection')
      .select('selfie_id', { count: 'exact', head: true })
      .eq('user_id', user.id);
    lifetimeSelfieCount = collectionCount ?? 0;

    if (lifetimeSelfieCount === 0) {
      const { data: pickedId } = await serviceClient.rpc('pick_selfie_by_scene', {
        p_character_id: character.id,
        p_user_id: user.id,
        p_scene: 'greeting',
        p_allowed_tiers: ['free'],
      });
      if (pickedId) {
        const { data: selfie } = await serviceClient
          .from('selfie_pool')
          .select('id, rarity')
          .eq('id', pickedId as string)
          .single();
        if (selfie) greetingSelfie = selfie as GreetingSelfieCandidate;
      }
    }
  } catch (e) {
    console.error('[Conversations] Greeting selfie pick failed (non-fatal):', e);
  }

  const selfiePlan = planGreetingSelfie({
    isNewConversation: true,
    selfieCollectionCount: lifetimeSelfieCount,
    selfie: greetingSelfie,
    userId: user.id,
    characterId: character.id,
  });

  await serviceClient.from('messages').insert({
    conversation_id: newConversation.id,
    role: 'assistant',
    content_type: selfiePlan ? selfiePlan.contentType : 'text',
    content: greetingText,
    ...(selfiePlan
      ? { selfie_id: selfiePlan.selfieId, selfie_rarity: selfiePlan.rarity }
      : {}),
    credits_consumed: 0,
    metadata: { is_greeting: true, ...(selfiePlan ? { trigger_type: 'greeting' } : {}) },
  });

  if (selfiePlan) {
    // Mirror the chat-route unblurred delivery: collect + count the stat so
    // the gallery shows it and the economy sees the freebie as consumed.
    const { error: collectErr } = await serviceClient
      .from('user_selfie_collection')
      .upsert(selfiePlan.collectionUpsert, { onConflict: 'user_id,selfie_id' });
    if (collectErr) {
      console.error('[Conversations] Greeting selfie collect failed:', collectErr);
    }
    await serviceClient.rpc('increment_conversation_stats', {
      p_conversation_id: newConversation.id,
      p_is_selfie: true,
    });
  }

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
