import type { SupabaseClient } from '@supabase/supabase-js';
import type { MemoryRow, ExtractedMemory } from '@/types';

/**
 * Fetch user memories for system prompt injection.
 * Uses the get_user_memories RPC (recent 20 + top 10 confidence).
 */
export async function fetchUserMemories(
  serviceClient: SupabaseClient,
  userId: string,
  characterId: string
): Promise<MemoryRow[]> {
  const { data, error } = await serviceClient.rpc('get_user_memories', {
    p_user_id: userId,
    p_character_id: characterId,
    p_limit: 30,
  });

  if (error) {
    console.error('[MemoryStore] Failed to fetch memories:', error);
    return [];
  }

  return (data || []) as MemoryRow[];
}

/**
 * Format memories into system prompt injection text.
 */
export function formatMemoriesForPrompt(memories: MemoryRow[]): string {
  if (memories.length === 0) return '';

  const facts = memories.filter((m) => m.memory_type === 'fact');
  const preferences = memories.filter((m) => m.memory_type === 'preference');
  const events = memories.filter((m) => m.memory_type === 'event');
  const emotions = memories.filter((m) => m.memory_type === 'emotion');

  const lines: string[] = [];

  if (facts.length > 0) {
    lines.push('📌 Facts:');
    for (const f of facts) {
      lines.push(`- ${f.memory_key}: ${f.memory_value}`);
    }
  }

  if (preferences.length > 0) {
    lines.push('💜 Preferences:');
    for (const p of preferences) {
      lines.push(`- ${p.memory_key}: ${p.memory_value}`);
    }
  }

  if (events.length > 0) {
    lines.push('📅 Recent events:');
    for (const e of events) {
      lines.push(`- ${e.memory_key}: ${e.memory_value}`);
    }
  }

  if (emotions.length > 0) {
    lines.push('💭 Emotional context:');
    for (const em of emotions) {
      lines.push(`- ${em.memory_key}: ${em.memory_value}`);
    }
  }

  return `You remember the following about this user:\n${lines.join('\n')}\n\nUse this naturally in conversation. Don't force-mention everything. Reference memories only when relevant. If the user corrects something, accept the correction gracefully.`;
}

/**
 * Format existing memories as context for the extraction prompt
 * (to avoid re-extracting known facts).
 */
export function formatMemoriesForExtraction(memories: MemoryRow[]): string {
  if (memories.length === 0) return '';
  return memories.map((m) => `${m.memory_key}: ${m.memory_value}`).join('\n');
}

/**
 * Save extracted memories to DB via upsert_user_memory RPC.
 * Returns count of successfully saved memories.
 */
export async function saveExtractedMemories(
  serviceClient: SupabaseClient,
  userId: string,
  characterId: string,
  memories: ExtractedMemory[],
  sourceMessageId?: string
): Promise<number> {
  if (memories.length === 0) return 0;

  const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let savedCount = 0;

  // Process sequentially to respect DB constraints
  for (const mem of memories) {
    try {
      const { error } = await serviceClient.rpc('upsert_user_memory', {
        p_user_id: userId,
        p_character_id: characterId,
        p_memory_key: mem.key,
        p_memory_value: mem.value,
        p_memory_type: mem.type,
        p_confidence: mem.confidence,
        p_source_message_id: sourceMessageId || null,
        p_batch_id: batchId,
      });

      if (error) {
        console.warn(`[MemoryStore] Failed to save memory "${mem.key}":`, error.message);
      } else {
        savedCount++;
      }
    } catch (err) {
      console.warn(`[MemoryStore] Exception saving memory "${mem.key}":`, err);
    }
  }

  if (savedCount > 0) {
    console.log(
      `[MemoryStore] Saved ${savedCount}/${memories.length} memories for user=${userId.slice(0, 8)} char=${characterId.slice(0, 8)}`
    );
  }

  return savedCount;
}

/**
 * Increment the turn counter on conversation.
 * Returns current counter value BEFORE increment.
 */
export async function incrementTurnCounter(
  serviceClient: SupabaseClient,
  conversationId: string
): Promise<number> {
  // Atomic increment via RPC. The previous read-then-write implementation
  // raced when multiple after() callbacks ran concurrently (each read the
  // same value and wrote the same +1), so the counter lagged far behind the
  // real turn count and the extraction threshold was never reached.
  // Returns the counter value AFTER increment.
  const { data, error } = await serviceClient.rpc('increment_turn_counter', {
    p_conversation_id: conversationId,
  });

  if (error) {
    console.warn('[Memory] increment_turn_counter RPC failed:', error.message);
    return 0;
  }

  return (data as number) ?? 0;
}

/**
 * Reset turn counter after extraction.
 */
export async function resetTurnCounter(
  serviceClient: SupabaseClient,
  conversationId: string
): Promise<void> {
  await serviceClient
    .from('conversations')
    .update({ memory_turn_counter: 0 })
    .eq('id', conversationId);
}
