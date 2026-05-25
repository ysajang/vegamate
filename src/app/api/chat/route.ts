import { NextRequest } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiError, withErrorHandler, AppError } from '@/lib/api-utils';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { sanitizeString, isValidUUID } from '@/lib/validators';
import { CREDIT_CONFIG } from '@/config/constants';
import { evaluateSelfieTrigger } from '@/lib/chat/selfie-trigger';
import { generateAIResponse } from '@/lib/chat/ai-service';
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

  // 5. Check credits
  const { data: profile } = await serviceClient
    .from('profiles')
    .select('credit_balance')
    .eq('id', user.id)
    .single();

  if (!profile || profile.credit_balance < CREDIT_CONFIG.COST_PER_MESSAGE) {
    return apiError('Insufficient credits. Please purchase more.', 402);
  }

  // 6. Consume credits for user message
  const { data: creditResult } = await serviceClient.rpc('consume_credits', {
    p_user_id: user.id,
    p_amount: CREDIT_CONFIG.COST_PER_MESSAGE,
    p_tx_type: 'consume_chat',
    p_description: 'Chat message sent',
  });

  if (!creditResult?.[0]?.success) {
    return apiError('Insufficient credits. Please purchase more.', 402);
  }

  let creditsRemaining = creditResult[0].new_balance;

  // 7. Save user message
  const { data: userMsg, error: userMsgError } = await serviceClient
    .from('messages')
    .insert({
      conversation_id: conversationId,
      role: 'user',
      content_type: 'text',
      content,
      credits_consumed: CREDIT_CONFIG.COST_PER_MESSAGE,
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

  // 8. Load recent message history for AI context
  const { data: historyRows } = await serviceClient
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(30);

  const history = (historyRows || []) as DbMessage[];

  // 9. Evaluate selfie trigger
  const selfieMessages = history.filter((m) => m.selfie_id !== null);
  const lastSelfieIndex = selfieMessages.length > 0
    ? history.length - 1 - history.lastIndexOf(selfieMessages[selfieMessages.length - 1])
    : null;

  // Check if user is coming back after absence (>6 hours since last user message)
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

  // If selfie triggered, check if user has enough credits for selfie cost
  let willSendSelfie = triggerResult.shouldSendSelfie;
  if (willSendSelfie && creditsRemaining < CREDIT_CONFIG.COST_PER_SELFIE) {
    willSendSelfie = false; // silently skip selfie if not enough credits
  }

  // 10. Generate AI response
  const aiResult = await generateAIResponse({
    character,
    history,
    userMessage: content,
    shouldIncludeSelfie: willSendSelfie,
  });

  // Crisis override: AI service already suppressed selfie in prompt,
  // but also skip selfie delivery on our side
  if (aiResult.crisisSeverity !== 'none') {
    willSendSelfie = false;
  }

  // 11. If selfie triggered, pick one and consume credits
  let selfieData: DbSelfie | null = null;

  if (willSendSelfie) {
    // Pick selfie from pool
    const { data: selfieIdResult } = await serviceClient.rpc('pick_selfie', {
      p_character_id: character.id,
      p_user_id: user.id,
      p_trigger: triggerResult.triggerType,
    });

    const selfieId = selfieIdResult as string | null;

    if (selfieId) {
      // Consume selfie credits
      const { data: selfieCreditResult } = await serviceClient.rpc('consume_credits', {
        p_user_id: user.id,
        p_amount: CREDIT_CONFIG.COST_PER_SELFIE,
        p_tx_type: 'consume_selfie',
        p_description: `Selfie from ${character.name}`,
      });

      if (selfieCreditResult?.[0]?.success) {
        creditsRemaining = selfieCreditResult[0].new_balance;

        // Fetch selfie data
        const { data: selfie } = await serviceClient
          .from('selfie_pool')
          .select('*')
          .eq('id', selfieId)
          .single();

        if (selfie) {
          selfieData = selfie as DbSelfie;

          // Add to user collection
          await serviceClient.from('user_selfie_collection').upsert(
            {
              user_id: user.id,
              selfie_id: selfieId,
              character_id: character.id,
              rarity: selfie.rarity,
            },
            { onConflict: 'user_id,selfie_id' }
          );

          // Update profile selfie count
          await serviceClient
            .from('profiles')
            .update({
              total_selfies_received: (profile.credit_balance > 0) // just incrementing
                ? undefined
                : undefined,
            })
            .eq('id', user.id);

          // Increment via raw SQL for atomicity
          await serviceClient.rpc('increment_conversation_stats', {
            p_conversation_id: conversationId,
            p_is_selfie: true,
          });
        }
      } else {
        // Not enough credits for selfie -> send text-only response
        willSendSelfie = false;
      }
    } else {
      willSendSelfie = false;
    }
  }

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
    content: aiResult.content,
    credits_consumed: selfieData ? CREDIT_CONFIG.COST_PER_SELFIE : 0,
    metadata: {
      model_used: 'gpt-4o-mini',
      tokens_used: aiResult.tokensUsed,
      response_time_ms: aiResult.responseTimeMs,
      trigger_type: willSendSelfie ? triggerResult.triggerType : null,
      trigger_confidence: willSendSelfie ? triggerResult.confidence : null,
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

  // 13. Return response
  return apiSuccess({
    message: savedAiMsg as DbMessage,
    selfie: selfieData,
    credits_remaining: creditsRemaining,
  });
}

export const POST = withErrorHandler(handler);
