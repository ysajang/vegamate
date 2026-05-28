import type { SupabaseClient } from '@supabase/supabase-js';
import type { DbSelfie, SelfieRarity } from '@/types';
import { PROACTIVE_CONFIG, PROACTIVE_RARITY_RATES } from '@/config/constants';

/**
 * Decide whether a proactive message should include a selfie.
 * Returns true with probability between SELFIE_CHANCE_MIN and SELFIE_CHANCE_MAX.
 */
export function shouldIncludeProactiveSelfie(): boolean {
  const { SELFIE_CHANCE_MIN, SELFIE_CHANCE_MAX } = PROACTIVE_CONFIG;
  const chance = SELFIE_CHANCE_MIN + Math.random() * (SELFIE_CHANCE_MAX - SELFIE_CHANCE_MIN);
  return Math.random() < chance;
}

/**
 * Roll rarity using proactive-specific drop rates.
 * Uses weighted random selection.
 */
export function rollProactiveRarity(): SelfieRarity {
  const roll = Math.random();
  let cumulative = 0;

  const entries = Object.entries(PROACTIVE_RARITY_RATES) as [SelfieRarity, number][];
  for (const [rarity, rate] of entries) {
    cumulative += rate;
    if (roll < cumulative) {
      return rarity;
    }
  }

  // Fallback (should never reach)
  return 'common';
}

/**
 * Pick a selfie from the pool for proactive message.
 * Matches character + target rarity. Falls back to adjacent rarities if no match.
 */
export async function pickProactiveSelfie(
  serviceClient: SupabaseClient,
  characterId: string,
  targetRarity: SelfieRarity,
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night'
): Promise<DbSelfie | null> {
  // Try exact rarity + time_of_day match first
  if (timeOfDay) {
    const { data: matched } = await serviceClient
      .from('selfie_pool')
      .select('*')
      .eq('character_id', characterId)
      .eq('rarity', targetRarity)
      .eq('is_active', true)
      .or(`time_of_day.eq.${timeOfDay},time_of_day.is.null`)
      .limit(10);

    if (matched && matched.length > 0) {
      const pick = matched[Math.floor(Math.random() * matched.length)];
      return pick as DbSelfie;
    }
  }

  // Fallback: exact rarity, any time
  const { data: rarityMatch } = await serviceClient
    .from('selfie_pool')
    .select('*')
    .eq('character_id', characterId)
    .eq('rarity', targetRarity)
    .eq('is_active', true)
    .limit(10);

  if (rarityMatch && rarityMatch.length > 0) {
    const pick = rarityMatch[Math.floor(Math.random() * rarityMatch.length)];
    return pick as DbSelfie;
  }

  // Final fallback: any active selfie for this character
  const { data: anyMatch } = await serviceClient
    .from('selfie_pool')
    .select('*')
    .eq('character_id', characterId)
    .eq('is_active', true)
    .limit(10);

  if (anyMatch && anyMatch.length > 0) {
    const pick = anyMatch[Math.floor(Math.random() * anyMatch.length)];
    return pick as DbSelfie;
  }

  return null;
}

/**
 * Get current time-of-day category based on hour.
 */
export function getTimeOfDay(hour: number): 'morning' | 'afternoon' | 'evening' | 'night' {
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}
