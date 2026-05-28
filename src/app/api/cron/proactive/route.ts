import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { PROACTIVE_CONFIG } from '@/config/constants';
import {
  generateProactiveMessage,
  pickCategory,
  detectLanguageFromMessages,
  type ProactiveContext,
} from '@/lib/chat/proactive-message';
import { fetchUserMemories } from '@/lib/chat/memory-store';
import {
  shouldIncludeProactiveSelfie,
  rollProactiveRarity,
  pickProactiveSelfie,
  getTimeOfDay,
} from '@/lib/chat/proactive-selfie';
import { sendPushToUser, type PushPayload } from '@/lib/push';
import type { DbCharacter, DbMessage, DbSelfie } from '@/types';

// ── Helpers ─────────────────────────────────────────────────

/**
 * Get user's local hour from their timezone string.
 * Falls back to UTC if timezone is invalid.
 */
function getUserLocalHour(timezone: string): number {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: timezone,
    });
    return parseInt(formatter.format(now), 10);
  } catch {
    return new Date().getUTCHours();
  }
}

/**
 * Check if current time is within quiet hours for the user.
 */
function isQuietHours(timezone: string): boolean {
  const hour = getUserLocalHour(timezone);
  const { QUIET_HOURS_START, QUIET_HOURS_END } = PROACTIVE_CONFIG;

  // Quiet hours wrap around midnight: 23:00 ~ 08:00
  if (QUIET_HOURS_START > QUIET_HOURS_END) {
    return hour >= QUIET_HOURS_START || hour < QUIET_HOURS_END;
  }
  return hour >= QUIET_HOURS_START && hour < QUIET_HOURS_END;
}

/**
 * Check if the user should be eligible for a proactive message right now.
 * Uses randomized timing within the MIN~MAX inactive window.
 */
function shouldTriggerNow(hoursInactive: number): boolean {
  const { MIN_INACTIVE_HOURS, MAX_INACTIVE_HOURS } = PROACTIVE_CONFIG;

  if (hoursInactive < MIN_INACTIVE_HOURS) return false;
  if (hoursInactive >= MAX_INACTIVE_HOURS) return true;

  // Random trigger probability increases linearly with inactivity
  const range = MAX_INACTIVE_HOURS - MIN_INACTIVE_HOURS;
  const progress = (hoursInactive - MIN_INACTIVE_HOURS) / range;
  return Math.random() < progress;
}

/**
 * Fetch last N messages from a conversation for context injection.
 */
async function fetchRecentMessages(
  serviceClient: ReturnType<typeof createServiceRoleClient>,
  conversationId: string,
  limit: number = 10
): Promise<DbMessage[]> {
  const { data, error } = await serviceClient
    .from('messages')
    .select('id, conversation_id, role, content_type, content, selfie_id, selfie_rarity, credits_consumed, is_proactive, metadata, created_at')
    .eq('conversation_id', conversationId)
    .neq('role', 'system')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) {
    console.warn('[Proactive Cron] Failed to fetch recent messages:', error?.message);
    return [];
  }

  // Reverse to chronological order
  return (data as DbMessage[]).reverse();
}

// ── Main handler ────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // 1. Verify CRON_SECRET (Vercel sends Authorization: Bearer <CRON_SECRET>)
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('[Proactive Cron] CRON_SECRET not configured');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    console.warn('[Proactive Cron] Unauthorized cron invocation');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const serviceClient = createServiceRoleClient();

  try {
    // 2. Get active characters
    const { data: characters, error: charError } = await serviceClient
      .from('characters')
      .select('*')
      .eq('is_active', true);

    if (charError || !characters || characters.length === 0) {
      console.log('[Proactive Cron] No active characters found');
      return NextResponse.json({ ok: true, processed: 0 });
    }

    // 3. Find eligible users
    // Criteria: has push subscription + was active within last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: eligibleConversations, error: convError } = await serviceClient
      .from('conversations')
      .select(`
        id,
        user_id,
        character_id,
        last_message_at,
        last_user_message_at,
        message_count,
        profiles!conversations_user_id_fkey (
          id,
          timezone,
          preferred_language
        )
      `)
      .eq('is_active', true)
      .gt('last_message_at', sevenDaysAgo)
      .not('last_user_message_at', 'is', null)
      .limit(200);

    if (convError || !eligibleConversations) {
      console.error('[Proactive Cron] Failed to fetch conversations:', convError);
      return NextResponse.json({ ok: false, error: 'DB query failed' }, { status: 500 });
    }

    // 4. Filter and process
    let processed = 0;
    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Shuffle to avoid always processing same users first
    const shuffled = [...eligibleConversations].sort(() => Math.random() - 0.5);

    for (const conv of shuffled) {
      if (processed >= PROACTIVE_CONFIG.BATCH_SIZE) break;

      const userId = conv.user_id;
      const characterId = conv.character_id;
      const profile = conv.profiles as unknown as {
        id: string;
        timezone: string;
        preferred_language: string | null;
      } | null;
      const timezone = profile?.timezone || 'UTC';
      const profileLanguage = profile?.preferred_language || null;

      try {
        // 4a. Quiet hours check
        if (isQuietHours(timezone)) {
          skipped++;
          continue;
        }

        // 4b. Inactivity window check
        const lastUserMsg = new Date(conv.last_user_message_at!).getTime();
        const hoursInactive = (Date.now() - lastUserMsg) / (1000 * 60 * 60);

        if (!shouldTriggerNow(hoursInactive)) {
          skipped++;
          continue;
        }

        // 4c. Daily limit check
        const todayStart = new Date();
        todayStart.setUTCHours(0, 0, 0, 0);

        const { count: dailyCount } = await serviceClient
          .from('proactive_message_log')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .gte('sent_at', todayStart.toISOString());

        if ((dailyCount ?? 0) >= PROACTIVE_CONFIG.MAX_DAILY_SENDS) {
          skipped++;
          continue;
        }

        // 4d. Consecutive send check (no 2+ sends without user response)
        const { data: recentLogs } = await serviceClient
          .from('proactive_message_log')
          .select('sent_at')
          .eq('user_id', userId)
          .eq('character_id', characterId)
          .order('sent_at', { ascending: false })
          .limit(PROACTIVE_CONFIG.MAX_CONSECUTIVE_SENDS);

        if (recentLogs && recentLogs.length >= PROACTIVE_CONFIG.MAX_CONSECUTIVE_SENDS) {
          const oldestRecentProactive = recentLogs[recentLogs.length - 1].sent_at;

          const { data: userMsgAfter } = await serviceClient
            .from('messages')
            .select('id')
            .eq('conversation_id', conv.id)
            .eq('role', 'user')
            .gt('created_at', oldestRecentProactive)
            .limit(1);

          if (!userMsgAfter || userMsgAfter.length === 0) {
            skipped++;
            continue;
          }
        }

        // 4e. Check user has push subscription
        const { data: pushSubs } = await serviceClient
          .from('push_subscriptions')
          .select('endpoint, p256dh, auth')
          .eq('user_id', userId)
          .eq('is_active', true);

        if (!pushSubs || pushSubs.length === 0) {
          skipped++;
          continue;
        }

        // ── This user is eligible -> generate and send ──

        processed++;

        const character = characters.find((c) => c.id === characterId) as DbCharacter | undefined;
        if (!character) {
          skipped++;
          continue;
        }

        const localHour = getUserLocalHour(timezone);
        const timeOfDay = getTimeOfDay(localHour);

        // Fetch recent conversation for context (last 10 messages = ~5 turns)
        const recentMessages = await fetchRecentMessages(serviceClient, conv.id, 10);

        // Detect language
        const language = detectLanguageFromMessages(recentMessages, profileLanguage);

        // Update preferred_language in profile if detected differs from stored
        if (language !== profileLanguage && recentMessages.length >= 3) {
          await serviceClient
            .from('profiles')
            .update({ preferred_language: language })
            .eq('id', userId);
        }

        // Fetch memories
        const memories = await fetchUserMemories(serviceClient, userId, characterId);

        // Pick category based on context (not just time of day)
        const category = pickCategory(hoursInactive, recentMessages, memories);

        // Build proactive context
        const proactiveContext: ProactiveContext = {
          recentMessages,
          hoursInactive,
          localHour,
          timeOfDay,
          language,
        };

        // Generate AI message
        const msgResult = await generateProactiveMessage(
          character,
          memories,
          category,
          proactiveContext
        );

        if (!msgResult.content || msgResult.content.length === 0) {
          errors.push(`Empty AI response for user=${userId.slice(0, 8)}`);
          continue;
        }

        // Selfie decision - boost for Ren and for longer inactivity
        let includeSelfie = shouldIncludeProactiveSelfie();

        // Ren gets higher selfie chance (core to character style)
        if (character.name.toLowerCase() === 'ren' && !includeSelfie) {
          includeSelfie = Math.random() < 0.4; // extra 40% chance for Ren
        }

        // Longer inactivity -> higher selfie chance
        if (hoursInactive >= 6 && !includeSelfie) {
          includeSelfie = Math.random() < 0.3; // extra 30% for 6h+
        }

        // Check if AI already included [SELFIE] marker in response
        const aiRequestedSelfie = msgResult.content.includes('[SELFIE]');
        if (aiRequestedSelfie) {
          includeSelfie = true;
        }

        let selfieData: DbSelfie | null = null;

        if (includeSelfie) {
          const rarity = rollProactiveRarity();
          selfieData = await pickProactiveSelfie(serviceClient, characterId, rarity, timeOfDay);
        }

        // Clean [SELFIE] marker from content if present
        let messageContent = msgResult.content.replace(/\[SELFIE\]/g, '').trim();

        // If content is empty after removing markers (Ren-style selfie-only)
        if (!messageContent && selfieData) {
          messageContent = '.'; // Minimal text for selfie-only messages
        } else if (!messageContent) {
          messageContent = ''; // Skip if somehow empty and no selfie
          errors.push(`Empty content after cleanup for user=${userId.slice(0, 8)}`);
          continue;
        }

        // Determine content type
        const contentType = selfieData ? 'text_with_selfie' : 'text';

        // Save message to DB
        const messageInsert: Record<string, unknown> = {
          conversation_id: conv.id,
          role: 'assistant',
          content_type: contentType,
          content: messageContent,
          credits_consumed: 0, // proactive = free
          is_proactive: true,
          metadata: {
            model_used: 'gpt-4o-mini',
            tokens_used: msgResult.tokensUsed,
            proactive_category: category,
            memory_keys_used: msgResult.memoryKeysUsed,
            language,
          },
        };

        if (selfieData) {
          messageInsert.selfie_id = selfieData.id;
          messageInsert.selfie_rarity = selfieData.rarity;
        }

        const { data: savedMsg, error: msgError } = await serviceClient
          .from('messages')
          .insert(messageInsert)
          .select()
          .single();

        if (msgError || !savedMsg) {
          errors.push(`Failed to save message for user=${userId.slice(0, 8)}: ${msgError?.message}`);
          continue;
        }

        // Update conversation timestamps
        await serviceClient
          .from('conversations')
          .update({
            last_message_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', conv.id);

        // Add selfie to collection if included (free - no credit charge)
        if (selfieData) {
          await serviceClient.from('user_selfie_collection').upsert(
            {
              user_id: userId,
              selfie_id: selfieData.id,
              character_id: characterId,
              message_id: savedMsg.id,
              rarity: selfieData.rarity,
            },
            { onConflict: 'user_id,selfie_id' }
          );
        }

        // Log the proactive send
        await serviceClient.from('proactive_message_log').insert({
          user_id: userId,
          character_id: characterId,
          message_id: savedMsg.id,
          category,
          has_selfie: !!selfieData,
          selfie_rarity: selfieData?.rarity || null,
          tokens_used: msgResult.tokensUsed,
        });

        // Send push notification
        const pushBody = messageContent.slice(0, 30) + (messageContent.length > 30 ? '...' : '');
        const pushPayload: PushPayload = {
          title: character.name,
          body: pushBody,
          tag: `proactive-${conv.id}`,
          url: `/chat/${character.slug}`,
        };

        const pushResult = await sendPushToUser(
          pushSubs,
          pushPayload,
          async (expiredEndpoint) => {
            await serviceClient
              .from('push_subscriptions')
              .update({ is_active: false })
              .eq('endpoint', expiredEndpoint);
          }
        );

        if (pushResult > 0) {
          sent++;
        }

        console.log(
          `[Proactive Cron] Sent to user=${userId.slice(0, 8)} char=${character.name} ` +
          `category=${category} lang=${language} selfie=${!!selfieData} push=${pushResult > 0}`
        );

      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        errors.push(`user=${userId.slice(0, 8)}: ${msg}`);
        console.error(`[Proactive Cron] Error processing user=${userId.slice(0, 8)}:`, err);
      }
    }

    const durationMs = Date.now() - startTime;

    console.log(
      `[Proactive Cron] Complete: processed=${processed} sent=${sent} ` +
      `skipped=${skipped} errors=${errors.length} duration=${durationMs}ms`
    );

    return NextResponse.json({
      ok: true,
      processed,
      sent,
      skipped,
      errors: errors.length,
      durationMs,
    });

  } catch (err) {
    console.error('[Proactive Cron] Fatal error:', err);
    return NextResponse.json(
      { ok: false, error: 'Internal error' },
      { status: 500 }
    );
  }
}
