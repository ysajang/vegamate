import { NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { apiSuccess, withErrorHandler, AppError } from '@/lib/api-utils';
import { isValidUUID } from '@/lib/validators';

/**
 * GET /api/memories/[characterId] — "Our story" album data.
 *
 * Aggregates the relationship record for one user↔character pair:
 *  - relationship stage + days together + message/selfie counts
 *  - what the character remembers about the user (user_memory curation)
 *  - gift history (item name/emoji/date ONLY — currency values never exposed)
 *
 * Tone contract: this is a memory album, not a stats dashboard and not a
 * retention threat. No hearts/credits/balances anywhere in the payload.
 */
async function getHandler(
  _req: NextRequest,
  { params }: { params: Promise<{ characterId: string }> }
) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const { characterId } = await params;
  if (!characterId || !isValidUUID(characterId)) {
    throw new AppError('Invalid character ID');
  }

  // All reads run as the user (RLS: own rows only).
  const [convRes, memRes, giftRes, charRes] = await Promise.all([
    supabase
      .from('conversations')
      .select('id, created_at, message_count, selfie_count, intimacy_stage')
      .eq('user_id', user.id)
      .eq('character_id', characterId)
      .single(),
    supabase
      .from('user_memory')
      .select('memory_key, memory_value, memory_type, updated_at')
      .eq('user_id', user.id)
      .eq('character_id', characterId)
      .order('updated_at', { ascending: false })
      .limit(24),
    supabase
      .from('gift_transactions')
      .select('id, created_at, gift:gifts(slug, name, emoji)')
      .eq('user_id', user.id)
      .eq('character_id', characterId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('characters')
      .select('id, slug, name, avatar_url')
      .eq('id', characterId)
      .single(),
  ]);

  if (!charRes.data) {
    throw new AppError('Character not found', 404);
  }

  const conv = convRes.data;
  const daysTogether = conv
    ? Math.max(1, Math.ceil((Date.now() - new Date(conv.created_at).getTime()) / 86_400_000))
    : 0;

  // Curate memories for display: the album shows what the character
  // remembers, not the raw extraction log. Gift events are shown in their
  // own section, so exclude gift_* keys here to avoid duplication.
  const memories = (memRes.data || [])
    .filter((m) => !m.memory_key.startsWith('gift_'))
    .slice(0, 12)
    .map((m) => ({
      key: m.memory_key,
      value: m.memory_value,
      type: m.memory_type,
    }));

  const gifts = (giftRes.data || []).map((g) => ({
    id: g.id,
    date: g.created_at,
    gift: g.gift,
  }));

  return apiSuccess({
    character: charRes.data,
    relationship: conv
      ? {
          stage: conv.intimacy_stage ?? 0,
          days_together: daysTogether,
          message_count: conv.message_count ?? 0,
          selfie_count: conv.selfie_count ?? 0,
          since: conv.created_at,
        }
      : null,
    memories,
    gifts,
  });
}

export const GET = withErrorHandler(getHandler);
