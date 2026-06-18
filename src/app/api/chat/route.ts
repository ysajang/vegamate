import { NextRequest, after } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiError, withErrorHandler, AppError } from '@/lib/api-utils';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { sanitizeString, isValidUUID } from '@/lib/validators';
import { HEART_CONFIG, LLM_CONFIG } from '@/config/constants';
import { assertAgeVerified } from '@/lib/auth/age-guard';
import { evaluateSelfieGuard } from '@/lib/chat/selfie-trigger';
import { getCharacterScenes } from '@/lib/chat/selfie-context';
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
import { resolveBalanceState, resolveGiftSurface } from '@/lib/chat/gift-nudge';
import {
  computeTurnIntimacyPoints,
  shouldShowUpgradePrompt,
  suggestedTierForStage,
} from '@/lib/chat/intimacy';
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

  // Age gate at the data-access layer (see age-guard.ts). Enforced here, not
  // just in onboarding UI, so a direct/deep-link request to chat can't bypass
  // the adult check. Free conversation was previously ungated — only payment
  // checked age — so a non-verified user could chat on signup hearts.
  await assertAgeVerified(serviceClient, user.id);

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
  // Active subscribers are promised unlimited conversation — they must never
  // consume hearts nor hit the gift gate. Checked BEFORE consume_heart
  // (previously only checked deep in the intimacy block, so subscribers were
  // being charged hearts: a direct breach of the subscription perk).
  const subCheck = await serviceClient.rpc('get_active_subscription', {
    p_user_id: user.id,
  });
  const isSubscriber = Boolean(subCheck.data?.active);

  const { data: heartBalance } = isSubscriber
    ? { data: null }
    : await serviceClient.rpc('consume_heart', {
        p_user_id: user.id,
      });

  // heartBalance semantics from consume_heart RPC:
  //   >0  : a heart was deducted, this is the remaining balance
  //    0  : the user just spent their LAST heart (final paid turn)
  //   -1  : nothing to deduct — the user is already at zero (no heart spent)
  //   null: subscriber (unlimited)
  //
  // Bugfix (P0 monetization): previously a -1 returned an early canned
  // "hearts_exhausted" wall WITHOUT running the AI turn — so at zero balance the
  // character never actually begged and no inline gift card was emitted. Now the
  // AI turn ALWAYS runs (crisis or not); the zero state just (a) injects a
  // stronger "short, gift-awaiting reply + REQUIRED gift marker" directive and
  // (b) marks the conversation exhausted so the input is gated AFTER this reply.
  // No heart is consumed at -1 (RPC's WHERE balance>0 simply matched nothing).
  let heartsRemaining: number;
  if (isSubscriber) {
    heartsRemaining = Number.MAX_SAFE_INTEGER;
  } else if (heartBalance === -1) {
    // Already at zero — run a free "beg" turn, then gate (via resolveBalanceState).
    heartsRemaining = 0;
  } else {
    heartsRemaining = heartBalance as number; // 0 (last heart) or >0
  }

  // Decide gift-nudge + turn policy from the balance state (pure, tested).
  const balanceState = resolveBalanceState({
    heartsRemaining,
    threshold: HEART_CONFIG.LOW_BALANCE_THRESHOLD,
    isSubscriber,
  });
  // balanceState.exhausted is true at heartsRemaining===0 (the -1 case). The
  // returned-0 "last heart" case is nudge='low' and NOT exhausted, so that
  // final paid turn behaves like a normal low-balance turn.

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

  // 7. Load recent message history for AI context.
  // Must be the MOST RECENT messages: ordering ascending with a limit loaded
  // the OLDEST 30, so once a conversation passed 30 messages the AI was stuck
  // seeing only the opening exchange (e.g. early "you created me" role-play)
  // and never the latest turns — causing context loss and topic fixation.
  // Order descending (newest first), then reverse to chronological for the model.
  const { data: historyRows } = await serviceClient
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(30);

  const history = ((historyRows || []) as DbMessage[]).slice().reverse();

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

  // 8. Selfie frequency guard (anti-spam only — the AI decides whether to
  //    actually send one, based on whether a photo fits the moment).
  const selfieMessages = history.filter((m) => m.selfie_id !== null);
  const lastSelfieIndex = selfieMessages.length > 0
    ? history.length - 1 - history.lastIndexOf(selfieMessages[selfieMessages.length - 1])
    : null;

  const guard = evaluateSelfieGuard({
    messageCount: conversation.message_count,
    lastSelfieMessageIndex: lastSelfieIndex,
  });

  // Re-engagement signal (used by intimacy scoring below).
  const isComeback = (() => {
    if (!conversation.last_user_message_at) return false;
    const lastActive = new Date(conversation.last_user_message_at).getTime();
    const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;
    return lastActive < sixHoursAgo;
  })();

  // Load the scenes that actually have images, so the AI's [SELFIE:scene]
  // matches a real photo (caption ↔ image alignment).
  let availableScenes: string[] = [];
  if (guard.allowed) {
    try {
      availableScenes = await getCharacterScenes(serviceClient, character.id);
    } catch (err) {
      console.warn('[Chat] Scene load failed (continuing without):', err);
    }
  }

  // 9. Generate AI response — the AI decides if/what selfie via [SELFIE:scene]
  const aiResult = await generateAIResponse({
    character,
    history,
    userMessage: content,
    selfieAllowed: guard.allowed,
    availableScenes,
    memoryContext,
    messageCount: conversation.message_count,
    heartsRemaining,
    giftNudge: balanceState.nudge,
  });

  // The AI's choice drives selfie sending (crisis already suppressed upstream).
  let willSendSelfie = aiResult.sendSelfie && aiResult.crisisSeverity === 'none';

  // 10. If the AI chose to send a selfie, pick one matching its scene
  let selfieData: DbSelfie | null = null;

  if (willSendSelfie) {
    const { data: selfieIdResult } = await serviceClient.rpc('pick_selfie_by_scene', {
      p_character_id: character.id,
      p_user_id: user.id,
      p_scene: aiResult.selfieScene,
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

  // Decide the gift card surface + input gating (pure, tested). In the zero
  // state a card is guaranteed (fallback slug) so the user is never dead-ended
  // by a missed marker; crisis turns suppress the gift and never gate.
  const giftSuppressedByCrisis = aiResult.crisisSeverity !== 'none';
  const giftSurface = resolveGiftSurface({
    nudge: balanceState.nudge,
    exhausted: balanceState.exhausted,
    parsedGiftSlug: giftMarker?.giftSlug ?? null,
    isCrisis: giftSuppressedByCrisis,
  });
  const effectiveGiftSlug = giftSurface.giftSlug;

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
      model_used: LLM_CONFIG.MODEL,
      tokens_used: aiResult.tokensUsed,
      response_time_ms: aiResult.responseTimeMs,
      trigger_type: willSendSelfie ? 'ai_contextual' : null,
      selfie_scene: willSendSelfie ? aiResult.selfieScene : null,
      gift_request: effectiveGiftSlug,
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

  // 12.5. Intimacy progression + in-chat upgrade prompt (hot-state monetization)
  // Relationship must be BUILT before any upgrade moment appears. Points accrue
  // slowly from ordinary turns; the prompt only surfaces on a stage-up at/above
  // the monetizable stage, once per stage, and never to existing subscribers.
  let upgradePrompt: { tier: 'deeper' | 'lover'; stage: number } | null = null;
  try {
    const turnPoints = computeTurnIntimacyPoints({ userMessage: content, isComeback });

    const { data: bump } = await serviceClient.rpc('bump_intimacy', {
      p_conversation_id: conversationId,
      p_points: turnPoints,
    });

    if (bump && bump.found && aiResult.crisisSeverity === 'none') {
      const hasActiveSubscription = isSubscriber;

      const show = shouldShowUpgradePrompt({
        stagedUp: Boolean(bump.staged_up),
        stage: Number(bump.stage),
        lastPromptStage: conversation.last_upgrade_prompt_stage ?? -1,
        lastPromptAt: conversation.last_upgrade_prompt_at ?? null,
        hasActiveSubscription,
      });

      if (show) {
        const stage = Number(bump.stage);
        const tier = suggestedTierForStage(stage);
        upgradePrompt = { tier, stage };

        // Re-arm only on the next stage-up: record we prompted at this stage.
        await serviceClient
          .from('conversations')
          .update({
            last_upgrade_prompt_stage: stage,
            last_upgrade_prompt_at: new Date().toISOString(),
          })
          .eq('id', conversationId);

        // Audit the intent surface (no payment yet — funnel/compliance log).
        await serviceClient.from('payment_intent_log').insert({
          user_id: user.id,
          kind: 'subscription',
          ref_slug: tier,
          amount_usd: 0,
          surface: 'upgrade_prompt',
          guard_result: 'allowed',
          intimacy_stage: stage,
          character_id: character.id,
        });
      }
    }
  } catch (err) {
    // Non-critical: chat already succeeded. Never block the reply on this.
    console.warn('[Chat] Intimacy/upgrade step failed (non-critical):', err);
  }

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
  // hearts_exhausted: true means "this was the user's last free turn — gate the
  // input AFTER showing this reply + gift card". Never gate on a crisis turn
  // (support must keep flowing). The character DID respond (begging in-character)
  // and a gift card is attached via gift_request, so this is a transparent
  // continue-with-a-gift moment, not a silent system block.
  const heartsExhausted = giftSurface.heartsExhausted;

  return apiSuccess({
    user_message: userMsg as DbMessage,
    message: savedAiMsg as DbMessage,
    selfie: selfieData,
    hearts_remaining: heartsRemaining,
    hearts_exhausted: heartsExhausted,
    gift_request: effectiveGiftSlug,
    upgrade_prompt: upgradePrompt,
  });
}

export const POST = withErrorHandler(handler);

// Allow time for the AI response plus the after() memory-extraction task to
// finish. Stays within the Hobby non-fluid ceiling (60s); harmless if the
// project has fluid compute enabled (higher default).
export const maxDuration = 60;
