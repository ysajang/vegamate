import { NextRequest, after } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiError, withErrorHandler, AppError } from '@/lib/api-utils';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { sanitizeString, isValidUUID } from '@/lib/validators';
import { HEART_CONFIG, HEART_EXHAUSTION_MESSAGES } from '@/config/constants';
import { evaluateSelfieTrigger } from '@/lib/chat/selfie-trigger';
import { generateAIResponse } from '@/lib/chat/ai-service';
import {
  fetchUserMemories,
  formatMemoriesForPrompt,
  formatMemoriesForExtraction,
  saveExtractedMemories,
  incrementTurnCounter,
  resetTurnCounter,
} from '@/lib/chat/memory-store';
import { extractMemories } from '@/lib/chat/memory-extraction';
import { MEMORY_CONFIG } from '@/config/constants';
import { parseGiftMarker } from '@/lib/chat/gift-parser';
import type { DbMessage, DbCharacter, DbSelfie } from '@/types';

async function handler(req: NextRequest) {
  // 1. Auth check
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  // 2. Rate limit
  const rl = checkRateLimit(`chat:${user.id}`, RATE_LIMITS.chat);
  if (!rl.allowed) {
    return apiError('Too many messages. Please slow down.', 429);
  }

  // 3. Parse & validate input
  const body = await req.json().catch(() => null);
  if (!body) {
    throw new AppError('Invalid request body');
  }

  const conversationId = sanitizeString(body.conversation_id);
  const content = sanitizeString(body.content);

  if (!conversationId || !isValidUUID(conversationId)) {
    throw new AppError('Invalid conversation_id');
  }
  if (!content || content.length === 0) {
    throw new AppError('Message content is required');
  }
  if (content.length > 2000) {
    throw new AppError('Message too long (max 2000 characters)');
  }

  const serviceClient = createServiceRoleClient();

  // 4. Verify conversation belongs to user + get character
  const { data: conversation, error: convError } = await serviceClient
    .from('conversations')
    .select('*, character:characters(*)')
    .eq('id', conversationId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single();

  if (convError || !conversation) {
    throw new AppError('Conversation not found', 404);
  }

  const character = conversation.character as DbCharacter;

  // 5. Check hearts (replaces credit check)
  const { data: heartBalance } = await serviceClient.rpc('consume_heart', {
    p_user_id: user.id,
  });

  // heartBalance === -1 means insufficient hearts
  if (heartBalance === -1) {
    // Return character-specific exhaustion message
    const charSlug = character.slug || 'default';
    const messages = HEART_EXHAUSTION_MESSAGES[charSlug] || HEART_EXHAUSTION_MESSAGES['default'];
    const exhaustionMsg = messages[Math.floor(Math.random() * messages.length)];

    return apiSuccess({
      hearts_exhausted: true,
      exhaustion_message: exhaustionMsg,
      character_slug: charSlug,
    });
  }

  const heartsRemaining = heartBalance as number;

  // 6. Save user message
  const { data: userMsg, error: userMsgError } = await serviceClient
    .from('messages')
    .insert({
      conversation_id: conversationId,
      role: 'user',
      content_type: 'text',
      content,
      credits_consumed: HEART_CONFIG.COST_PER_TURN,
    })
    .select()
    .single();

  if (userMsgError || !userMsg) {
    console.error('[Chat] Failed to save user message:', userMsgError);
    throw new AppError('Failed to send message', 500);
  }

  // Update conversation last_user_message_at
  await serviceClient
    .from('conversations')
    .update({ last_user_message_at: new Date().toISOString() })
    .eq('id', conversationId);

  // 7. Load recent message history for AI context
  const { data: historyRows } = await serviceClient
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(30);

  const history = (historyRows || []) as DbMessage[];

  // 7.5. Fetch user memories and build prompt context (non-blocking if fails)
  let memoryContext = '';
  let existingMemories: import('@/types').MemoryRow[] = [];
  try {
    existingMemories = await fetchUserMemories(serviceClient, user.id, character.id);
    memoryContext = formatMemoriesForPrompt(existingMemories);
  } catch (err) {
    console.warn('[Chat] Memory fetch failed (continuing without):', err);
    existingMemories = [];
  }

  // 8. Evaluate selfie trigger
  const selfieMessages = history.filter((m) => m.selfie_id !== null);
  const lastSelfieIndex = selfieMessages.length > 0
    ? history.length - 1 - history.lastIndexOf(selfieMessages[selfieMessages.length - 1])
    : null;

  const isComeback = (() => {
    if (!conversation.last_user_message_at) return false;
    const lastActive = new Date(conversation.last_user_message_at).getTime();
    const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;
    return lastActive < sixHoursAgo;
  })();

  const triggerResult = evaluateSelfieTrigger({
    userMessage: content,
    messageCount: conversation.message_count,
    aiEngagementLevel: conversation.ai_engagement_level,
    lastSelfieMessageIndex: lastSelfieIndex,
    isComeback,
  });

  // Selfies no longer cost hearts — always allow if triggered
  let willSendSelfie = triggerResult.shouldSendSelfie;

  // 9. Generate AI response
  const aiResult = await generateAIResponse({
    character,
    history,
    userMessage: content,
    shouldIncludeSelfie: willSendSelfie,
    memoryContext,
  });

  // Crisis override
  if (aiResult.crisisSeverity !== 'none') {
    willSendSelfie = false;
  }

  // 10. If selfie triggered, pick one (no heart cost for selfies)
  let selfieData: DbSelfie | null = null;

  if (willSendSelfie) {
    const { data: selfieIdResult } = await serviceClient.rpc('pick_selfie', {
      p_character_id: character.id,
      p_user_id: user.id,
      p_trigger: triggerResult.triggerType,
    });

    const selfieId = selfieIdResult as string | null;

    if (selfieId) {
      const { data: selfie } = await serviceClient
        .from('selfie_pool')
        .select('*')
        .eq('id', selfieId)
        .single();

      if (selfie) {
        selfieData = selfie as DbSelfie;

        await serviceClient.from('user_selfie_collection').upsert(
          {
            user_id: user.id,
            selfie_id: selfieId,
            character_id: character.id,
            rarity: selfie.rarity,
          },
          { onConflict: 'user_id,selfie_id' }
        );

        await serviceClient.rpc('increment_conversation_stats', {
          p_conversation_id: conversationId,
          p_is_selfie: true,
        });
      }
    } else {
      willSendSelfie = false;
    }
  }

  // 11. Parse [GIFT:type] marker from AI response
  const giftMarker = parseGiftMarker(aiResult.content);

  // 12. Save AI response message
  const aiMessage: {
    conversation_id: string;
    role: 'assistant';
    content_type: 'text' | 'selfie' | 'text_with_selfie';
    content: string;
    selfie_id?: string;
    selfie_rarity?: string;
    credits_consumed: number;
    metadata: Record<string, unknown>;
  } = {
    conversation_id: conversationId,
    role: 'assistant',
    content_type: selfieData ? 'text_with_selfie' : 'text',
    content: giftMarker ? giftMarker.cleanContent : aiResult.content,
    credits_consumed: 0, // selfies no longer cost hearts
    metadata: {
      model_used: 'gpt-4o-mini',
      tokens_used: aiResult.tokensUsed,
      response_time_ms: aiResult.responseTimeMs,
      trigger_type: willSendSelfie ? triggerResult.triggerType : null,
      trigger_confidence: willSendSelfie ? triggerResult.confidence : null,
      gift_request: giftMarker ? giftMarker.giftSlug : null,
    },
  };

  if (selfieData) {
    aiMessage.selfie_id = selfieData.id;
    aiMessage.selfie_rarity = selfieData.rarity;
  }

  const { data: savedAiMsg, error: aiMsgError } = await serviceClient
    .from('messages')
    .insert(aiMessage)
    .select('*, selfie:selfie_pool(*)')
    .single();

  if (aiMsgError) {
    console.error('[Chat] Failed to save AI message:', aiMsgError);
    throw new AppError('Failed to generate response', 500);
  }

  // Increment conversation stats (non-selfie case)
  if (!selfieData) {
    await serviceClient.rpc('increment_conversation_stats', {
      p_conversation_id: conversationId,
      p_is_selfie: false,
    });
  }

  // Update profile total_messages_sent
  await serviceClient
    .from('profiles')
    .update({ total_messages_sent: (conversation.message_count || 0) + 1 })
    .eq('id', user.id);

  // 13. Memory extraction (runs AFTER response is sent).
  // NOTE: Vercel freezes the function once the response returns, killing any
  // un-awaited "fire-and-forget" task. after() keeps the runtime alive so the
  // extraction + DB writes actually complete. (Next.js 15.1+, Node.js runtime)
  after(async () => {
    try {
      // incrementTurnCounter now returns the counter value AFTER increment
      // (atomic RPC), i.e. the number of user turns counted so far this cycle.
      const turnsCounted = await incrementTurnCounter(serviceClient, conversationId);

      if (turnsCounted >= MEMORY_CONFIG.EXTRACTION_INTERVAL) {
        // Build extraction input from persisted history PLUS the just-saved
        // user message and AI reply (history was loaded before they existed).
        const recentHistory = history.slice(-MEMORY_CONFIG.EXTRACTION_INTERVAL * 2);
        const recentForExtraction: DbMessage[] = [
          ...recentHistory,
          userMsg as DbMessage,
          ...(savedAiMsg ? [savedAiMsg as DbMessage] : []),
        ];
        const existingContext = formatMemoriesForExtraction(existingMemories || []);

        const extractionResult = await extractMemories(recentForExtraction, existingContext);

        if (extractionResult.memories.length > 0) {
          const saved = await saveExtractedMemories(
            serviceClient,
            user.id,
            character.id,
            extractionResult.memories,
            userMsg.id
          );
          console.log(
            `[Chat] Memory: extracted ${extractionResult.memories.length}, saved ${saved} ` +
              `(${extractionResult.tokensUsed} tokens, ${extractionResult.durationMs}ms)`
          );
        } else {
          console.log('[Chat] Memory: nothing new to extract this cycle');
        }

        await resetTurnCounter(serviceClient, conversationId);
      }
    } catch (err) {
      // Non-critical: chat already succeeded. Log and swallow.
      console.warn('[Chat] Memory extraction failed (non-critical):', err);
    }
  });

  // 14. Return response
  return apiSuccess({
    user_message: userMsg as DbMessage,
    message: savedAiMsg as DbMessage,
    selfie: selfieData,
    hearts_remaining: heartsRemaining,
    gift_request: giftMarker ? giftMarker.giftSlug : null,
  });
}

export const POST = withErrorHandler(handler);

// Allow time for the AI response plus the after() memory-extraction task to
// finish. Stays within the Hobby non-fluid ceiling (60s); harmless if the
// project has fluid compute enabled (higher default).
export const maxDuration = 60;
