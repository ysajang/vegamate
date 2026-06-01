import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, withErrorHandler } from '@/lib/api-utils';

/** Public list of active subscription tiers (for in-chat upgrade prompt). */
async function handler() {
  const serviceClient = createServiceRoleClient();

  const { data: tiers } = await serviceClient
    .from('subscription_tiers')
    .select('slug, name, price_usd, billing_interval, unlimited_hearts, lover_mode, perks, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  return apiSuccess({ tiers: tiers || [] });
}

export const GET = withErrorHandler(handler);
