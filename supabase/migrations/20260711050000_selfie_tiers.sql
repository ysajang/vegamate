-- ============================================================================
-- Selfie tier gating (round 1.5) — suggestive premium selfies for miku.
-- ⚠️ DO NOT APPLY without master confirmation (prod, seeds 12 rows).
-- ============================================================================

-- 1. Tier column. Every existing row stays 'free' (default), so nothing about
--    the current free pool changes.
alter table public.selfie_pool
  add column if not exists tier text not null default 'free'
  check (tier in ('free', 'premium_b', 'premium_a', 'premium_s'));

create index if not exists selfie_pool_tier_idx on public.selfie_pool (character_id, tier);

-- Blur-teaser unlock (round 1.5 addendum):
--   blurred_url  — public teaser image (server-side pre-generated gaussian,
--                  medium strength; originals never reach the client blurred
--                  via CSS — devtools would leak them)
--   private_path — object path inside the PRIVATE bucket 'selfies-private';
--                  originals were moved out of the public bucket. Premium
--                  image_url points at the entitlement API which redirects to
--                  a short-lived signed URL.
alter table public.selfie_pool add column if not exists blurred_url text;
alter table public.selfie_pool add column if not exists private_path text;

-- A gift purchase can be bound to one specific blurred card; on webhook
-- confirmation THAT selfie is unblurred (granted + sent). One card per tx.
alter table public.gift_transactions
  add column if not exists unblur_selfie_id uuid references public.selfie_pool(id);

-- Blur-teaser frequency guard: max one teaser card per user per day.
alter table public.profiles add column if not exists last_blur_teaser_at timestamptz;

-- 2. pick_selfie_by_scene v2 — tier-aware. p_allowed_tiers defaults to
--    array['free'] so every existing caller keeps today's exact behavior;
--    premium pools are opt-in per call. Final fallback now prefers unseen.
-- CREATE OR REPLACE with a changed parameter list OVERLOADS instead of
-- replacing — the old 3-param signature must be dropped or PostgREST RPC
-- resolution turns ambiguous (caught during apply, 2026-07-11).
drop function if exists public.pick_selfie_by_scene(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.pick_selfie_by_scene(
  p_character_id uuid,
  p_user_id uuid,
  p_scene text DEFAULT NULL::text,
  p_allowed_tiers text[] DEFAULT ARRAY['free']
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_rarity selfie_rarity;
  v_roll float;
  v_selfie_id uuid;
  v_scene text;
begin
  v_scene := nullif(trim(lower(p_scene)), '');

  -- 1. Exact scene match (unseen preferred), rarity-agnostic so a relevant
  --    contextual image always beats a gacha-correct but off-context one.
  if v_scene is not null then
    select sp.id into v_selfie_id
    from public.selfie_pool sp
    left join public.user_selfie_collection usc
      on usc.selfie_id = sp.id and usc.user_id = p_user_id
    where sp.character_id = p_character_id
      and sp.is_active = true
      and sp.tier = any(p_allowed_tiers)
      and lower(sp.scene) = v_scene
      and usc.id is null
    order by random()
    limit 1;

    -- 1b. Exact scene, allow already-seen
    if v_selfie_id is null then
      select sp.id into v_selfie_id
      from public.selfie_pool sp
      where sp.character_id = p_character_id
        and sp.is_active = true
        and sp.tier = any(p_allowed_tiers)
        and lower(sp.scene) = v_scene
      order by random()
      limit 1;
    end if;

    -- 1c. Fuzzy: scene token contained either direction (cafe ~ morning_cafe)
    if v_selfie_id is null then
      select sp.id into v_selfie_id
      from public.selfie_pool sp
      left join public.user_selfie_collection usc
        on usc.selfie_id = sp.id and usc.user_id = p_user_id
      where sp.character_id = p_character_id
        and sp.is_active = true
        and sp.tier = any(p_allowed_tiers)
        and (lower(sp.scene) like '%' || v_scene || '%'
             or v_scene like '%' || lower(sp.scene) || '%')
        and usc.id is null
      order by random()
      limit 1;
    end if;
  end if;

  -- 2. No scene / no match -> gacha rarity, any unseen
  if v_selfie_id is null then
    v_roll := random();
    v_rarity := case
      when v_roll < 0.02 then 'legendary'
      when v_roll < 0.10 then 'epic'
      when v_roll < 0.25 then 'rare'
      when v_roll < 0.55 then 'uncommon'
      else 'common'
    end;

    select sp.id into v_selfie_id
    from public.selfie_pool sp
    left join public.user_selfie_collection usc
      on usc.selfie_id = sp.id and usc.user_id = p_user_id
    where sp.character_id = p_character_id
      and sp.rarity = v_rarity
      and sp.is_active = true
      and sp.tier = any(p_allowed_tiers)
      and usc.id is null
    order by random()
    limit 1;
  end if;

  -- 3a. Fallback: any UNSEEN active selfie in allowed tiers (unseen preferred
  --     so premium thank-you sends favor a new image over a repeat).
  if v_selfie_id is null then
    select sp.id into v_selfie_id
    from public.selfie_pool sp
    left join public.user_selfie_collection usc
      on usc.selfie_id = sp.id and usc.user_id = p_user_id
    where sp.character_id = p_character_id
      and sp.is_active = true
      and sp.tier = any(p_allowed_tiers)
      and usc.id is null
    order by random()
    limit 1;
  end if;

  -- 3b. Final fallback: any active selfie in allowed tiers
  if v_selfie_id is null then
    select sp.id into v_selfie_id
    from public.selfie_pool sp
    where sp.character_id = p_character_id
      and sp.is_active = true
      and sp.tier = any(p_allowed_tiers)
    order by random()
    limit 1;
  end if;

  return v_selfie_id;
end;
$function$;

-- 3. Seed miku premium pool (12 assets, staging/miku_s01~s12; public URLs
--    verified). Tier map: S급→premium_s, A급→premium_a, B급→premium_b.
--    Rarity: premium_s→legendary, premium_a→epic, premium_b→rare (collection
--    feel; gacha never reaches these rows — tier filter excludes them from
--    free picks). Idempotent via NOT EXISTS on image_url.
with miku as (select id from public.characters where slug = 'miku'),
seed(fname, tier, rarity, scene, expression, outfit, time_of_day, trigger_contexts) as (
  values
    ('miku_s01.png','premium_a','epic','morning_bed','sleepy_smile','oversized_shirt','morning','{emotion_peak,keyword}'),
    ('miku_s02.png','premium_a','epic','beach_swimsuit','bright','one_piece_swimsuit','afternoon','{keyword,random}'),
    ('miku_s03.png','premium_s','legendary','poolside','playful','bikini','afternoon','{emotion_peak}'),
    ('miku_s04.png','premium_b','rare','night_room_knit','cozy','off_shoulder_knit','night','{random,keyword}'),
    ('miku_s05.png','premium_b','rare','bed_hoodie','relaxed','hoodie','evening','{random}'),
    ('miku_s06.png','premium_a','epic','after_bath','fresh','bathrobe','night','{emotion_peak}'),
    ('miku_s07.png','premium_a','epic','practice_stretch','focused','practice_wear','afternoon','{keyword,random}'),
    ('miku_s08.png','premium_b','rare','bed_pajama','soft','silk_pajamas','night','{random}'),
    ('miku_s09.png','premium_b','rare','sunset_dress','warm','sleeveless_dress','evening','{random,keyword}'),
    ('miku_s10.png','premium_s','legendary','after_shower','shy','towel','night','{emotion_peak}'),
    ('miku_s11.png','premium_b','rare','gaming_jersey','playful','basketball_jersey','evening','{keyword}'),
    ('miku_s12.png','premium_b','rare','late_night_bed','sleepy','blanket','night','{random}')
)
insert into public.selfie_pool
  (character_id, image_url, thumbnail_url, rarity, scene, expression, outfit, time_of_day, trigger_contexts, is_active, tier, private_path, blurred_url)
select
  miku.id,
  'pending', -- repointed to the entitlement API right below (needs the row id)
  null,
  s.rarity::selfie_rarity,
  s.scene, s.expression, s.outfit, s.time_of_day,
  s.trigger_contexts::public.selfie_trigger_type[],
  true,
  s.tier,
  'miku/' || s.fname,
  'https://lkkssjroquawqkdiiuhm.supabase.co/storage/v1/object/public/selfies/blurred/' || replace(s.fname, '.png', '.jpg')
from seed s, miku
where not exists (
  select 1 from public.selfie_pool sp
  where sp.private_path = 'miku/' || s.fname
);

-- Premium originals live behind the entitlement gate: /api/selfies/{id}/image
-- checks auth + (owned-in-collection OR tier-accessible) and 302s to a fresh
-- signed URL on the private bucket.
update public.selfie_pool
set image_url = '/api/selfies/' || id || '/image'
where tier <> 'free' and image_url = 'pending';

-- ============================================================================
-- VERIFICATION (run after apply):
--   select tier, count(*) from selfie_pool group by tier;
--     → free 78 / premium_b 6 / premium_a 4 / premium_s 2
--   select scene, tier, rarity from selfie_pool where tier <> 'free' order by tier, scene;
--   select pg_get_function_arguments(oid) from pg_proc where proname='pick_selfie_by_scene';
--     → ... p_allowed_tiers text[] DEFAULT ARRAY['free']
--   select count(*) from selfie_pool where tier <> 'free' and (blurred_url is null or private_path is null or image_url not like '/api/selfies/%');
--     → 0
--   -- free-path regression: RPC without the new param must still return only free rows.
-- ============================================================================
