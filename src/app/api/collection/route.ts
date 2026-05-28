import { NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { apiSuccess, apiError, withErrorHandler, AppError } from '@/lib/api-utils';
import { sanitizeString, isValidUUID } from '@/lib/validators';

// GET /api/collection -> list user's selfie collection
async function getHandler(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const url = new URL(req.url);
  const characterId = url.searchParams.get('character_id');
  const favoritesOnly = url.searchParams.get('favorites') === 'true';

  let query = supabase
    .from('user_selfie_collection')
    .select('*, selfie:selfie_pool(id, image_url, thumbnail_url, rarity, scene, expression, outfit), character:characters(id, slug, name, avatar_url)')
    .eq('user_id', user.id)
    .order('obtained_at', { ascending: false });

  if (characterId && isValidUUID(characterId)) {
    query = query.eq('character_id', characterId);
  }
  if (favoritesOnly) {
    query = query.eq('is_favorite', true);
  }

  const { data: collection, error } = await query;

  if (error) {
    console.error('[Collection] List error:', error);
    throw new AppError('Failed to load collection', 500);
  }

  return apiSuccess({ collection: collection || [] });
}

// PATCH /api/collection -> toggle favorite on a collection item
async function patchHandler(req: NextRequest) {
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

  const collectionItemId = sanitizeString(body.id);
  const isFavorite = body.is_favorite === true;

  if (!collectionItemId || !isValidUUID(collectionItemId)) {
    throw new AppError('Invalid collection item ID');
  }

  const { data: updated, error } = await supabase
    .from('user_selfie_collection')
    .update({ is_favorite: isFavorite })
    .eq('id', collectionItemId)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error || !updated) {
    return apiError('Item not found', 404);
  }

  return apiSuccess({ item: updated });
}

export const GET = withErrorHandler(getHandler);
export const PATCH = withErrorHandler(patchHandler);
