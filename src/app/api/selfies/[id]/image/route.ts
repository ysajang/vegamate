import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { AppError, withErrorHandler } from '@/lib/api-utils';
import { resolveAllowedTiers, type SelfieTier } from '@/lib/chat/selfie-tier';
import { isValidUUID } from '@/lib/validators';

/**
 * GET /api/selfies/[id]/image — entitlement gate for PREMIUM selfie originals.
 *
 * Premium originals live in the PRIVATE bucket (selfies-private); their
 * selfie_pool.image_url points here. We check auth + entitlement and 302 to a
 * short-lived signed URL. Free selfies never route through here.
 *
 * Entitled when EITHER:
 *  - the selfie is already in the user's collection (granted via gift
 *    thank-you / unblur purchase), or
 *  - the user's current access (Lover subscription / intimacy) covers the tier.
 *
 * Same-origin <img> requests carry the auth cookies (SameSite only restricts
 * cross-site), so a plain img tag works; the premium card renders unoptimized
 * to bypass the Next image optimizer (whose server-side fetch has no cookies).
 */
async function getHandler(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) throw new AppError('Invalid selfie id', 400);

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AppError('Unauthorized', 401);

  const serviceClient = createServiceRoleClient();
  const { data: selfie } = await serviceClient
    .from('selfie_pool')
    .select('id, tier, private_path, image_url')
    .eq('id', id)
    .single();

  if (!selfie || !selfie.private_path) throw new AppError('Not found', 404);

  const tier = (selfie.tier ?? 'free') as SelfieTier;

  let entitled = tier === 'free';
  if (!entitled) {
    const { data: owned } = await serviceClient
      .from('user_selfie_collection')
      .select('id')
      .eq('user_id', user.id)
      .eq('selfie_id', id)
      .limit(1);
    entitled = Boolean(owned && owned.length > 0);
  }
  if (!entitled) {
    const [{ data: sub }, { data: conv }] = await Promise.all([
      serviceClient.rpc('get_active_subscription', { p_user_id: user.id }),
      serviceClient
        .from('conversations')
        .select('intimacy_stage')
        .eq('user_id', user.id)
        .order('intimacy_stage', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const allowed = resolveAllowedTiers({
      hasActiveLover: Boolean((sub as { active?: boolean } | null)?.active),
      intimacyStage: conv?.intimacy_stage ?? 0,
    });
    entitled = allowed.includes(tier);
  }

  if (!entitled) throw new AppError('Forbidden', 403);

  const { data: signed, error } = await serviceClient.storage
    .from('selfies-private')
    .createSignedUrl(selfie.private_path, 60 * 60); // 1h; refreshed per load

  if (error || !signed?.signedUrl) {
    console.error('[SelfieImage] signed URL failed:', id, error);
    throw new AppError('Image unavailable', 500);
  }

  return NextResponse.redirect(signed.signedUrl, 302);
}

export const GET = withErrorHandler(getHandler);
