import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Context-driven selfie system.
 *
 * Old model: keyword match on the USER message ("고마워"/"사랑"/"예쁘") pre-decided
 * a selfie, then forced the AI to attach one. This was mechanical and broke
 * immersion — praising the companion instantly produced a photo, an obvious tell.
 *
 * New model: the AI itself decides, while writing its reply, whether a photo is
 * a NATURAL part of what it's saying (it just arrived at a cafe, it's showing
 * the user something it did) and emits a [SELFIE:scene] marker. We then match
 * that scene to a pre-generated image whose situation fits the caption.
 *
 * The keyword trigger is downgraded to a frequency/cooldown GUARD only — it can
 * suppress (anti-spam) but never force a selfie. The decision is the AI's.
 */

export interface SelfieMarkerResult {
  /** Scene keyword the AI chose (e.g. 'cafe', 'morning'), or null for unspecified. */
  scene: string | null;
  /** AI reply text with the marker removed. */
  cleanContent: string;
}

/**
 * Parse [SELFIE] or [SELFIE:scene] from the AI reply.
 * Returns null when the AI chose NOT to send a photo (the common case).
 *
 *   "방금 카페 왔어 [SELFIE:cafe]"  -> { scene: 'cafe', cleanContent: '방금 카페 왔어' }
 *   "보고 싶었어 [SELFIE]"          -> { scene: null,   cleanContent: '보고 싶었어' }
 *   "오늘 뭐했어?"                  -> null
 */
export function parseSelfieMarker(content: string): SelfieMarkerResult | null {
  // [SELFIE] or [SELFIE:scene_token]. scene token: letters, digits, _ , -
  const markerRegex = /\[SELFIE(?::([\w\- ]+))?\]/i;
  const match = content.match(markerRegex);

  if (!match) return null;

  const rawScene = match[1]?.trim().toLowerCase().replace(/\s+/g, '_') || null;
  const cleanContent = content.replace(markerRegex, '').trim();

  return { scene: rawScene, cleanContent };
}

/**
 * Fetch the distinct, active scene tokens available for a character so the AI
 * can be told which scenes actually have images. Without this the model invents
 * scene names that never match the pool, defeating context alignment.
 *
 * Cached in-process per character for the lifetime of the serverless instance;
 * the selfie pool changes rarely (manual asset uploads), so a short staleness
 * window is acceptable and saves a DB round-trip on every chat turn.
 */
const sceneCache = new Map<string, { scenes: string[]; at: number }>();
const SCENE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

export async function getCharacterScenes(
  client: SupabaseClient,
  characterId: string
): Promise<string[]> {
  const cached = sceneCache.get(characterId);
  if (cached && Date.now() - cached.at < SCENE_CACHE_TTL_MS) {
    return cached.scenes;
  }

  const { data, error } = await client
    .from('selfie_pool')
    .select('scene')
    .eq('character_id', characterId)
    .eq('is_active', true);

  if (error || !data) {
    // Non-fatal: AI can still emit [SELFIE] with no scene -> gacha fallback.
    return cached?.scenes ?? [];
  }

  const scenes = Array.from(
    new Set(
      data
        .map((r) => (r as { scene: string }).scene)
        .filter((s): s is string => Boolean(s) && s !== 'default')
    )
  ).sort();

  sceneCache.set(characterId, { scenes, at: Date.now() });
  return scenes;
}
