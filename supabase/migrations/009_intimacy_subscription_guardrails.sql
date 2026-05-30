-- ============================================================
-- 009: Intimacy progression + Subscription + Spending guardrails
-- ------------------------------------------------------------
-- Goal: move paywalls INTO the conversation (hot-state monetization)
--   1. intimacy_score / intimacy_stage on conversations
--      → "emotional peak" (stage-up) is the upgrade trigger
--   2. subscriptions: recurring revenue (the ~56% driver), gated
--      "연인 모드 / 무제한". Payment plumbing stays external (Creem);
--      this only stores state + tier definitions.
--   3. spending guardrails: daily spend cap, rapid-purchase cooldown,
--      age gate (birth_date). Chargeback / minor-refund risk control.
--   4. payment_intent_log: audit every "intent to pay" event.
--
-- Idempotent-ish: uses IF NOT EXISTS / ON CONFLICT where practical so a
-- partial re-run does not hard-fail in dev.
-- ============================================================

-- ── 1. Intimacy on conversations ───────────────────────────
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS intimacy_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS intimacy_stage integer NOT NULL DEFAULT 0,
  -- Last stage at which we showed an in-chat upgrade prompt, so we don't
  -- nag on every message after a peak. Re-arms only on the NEXT stage-up.
  ADD COLUMN IF NOT EXISTS last_upgrade_prompt_stage integer NOT NULL DEFAULT -1,
  ADD COLUMN IF NOT EXISTS last_upgrade_prompt_at timestamptz;

COMMENT ON COLUMN public.conversations.intimacy_score IS 'Cumulative intimacy points. +1 per user turn, + gift hearts_value/10 per gift. Drives intimacy_stage.';
COMMENT ON COLUMN public.conversations.intimacy_stage IS 'Derived 0..4: 0 stranger, 1 acquaintance, 2 close, 3 trusted, 4 devoted. Stage-up = emotional peak = upgrade moment.';
COMMENT ON COLUMN public.conversations.last_upgrade_prompt_stage IS 'Highest stage at which an in-chat upgrade prompt has been surfaced. Prevents repeat nagging within the same stage.';

-- Stage thresholds (cumulative score). Kept in SQL for the RPC; mirrored in TS constants.
--   stage 0: 0..29     stage 1: 30..79    stage 2: 80..179
--   stage 3: 180..349  stage 4: 350+

-- ── 2. Age gate on profiles ────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS birth_date date,
  -- Cached boolean so we don't recompute age on every request. Set when
  -- birth_date is written. NULL = not yet verified (treat as gated).
  ADD COLUMN IF NOT EXISTS age_verified_adult boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.birth_date IS 'Self-reported DOB for age gate. Required before any paid action (전자상거래/청소년보호).';
COMMENT ON COLUMN public.profiles.age_verified_adult IS 'True when birth_date implies age >= 19 (KR 만 나이 기준 보수적용). Gate for all paid flows.';

-- ── 3. Subscription tiers (master) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.subscription_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  price_usd numeric(10,2) NOT NULL,
  billing_interval text NOT NULL DEFAULT 'month' CHECK (billing_interval IN ('month', 'year')),
  -- Feature flags this tier unlocks
  unlimited_hearts boolean NOT NULL DEFAULT false,
  lover_mode boolean NOT NULL DEFAULT false,
  perks jsonb NOT NULL DEFAULT '[]'::jsonb,
  creem_product_id text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.subscription_tiers IS 'Subscription plan master. creem_product_id filled from Creem dashboard (external).';

-- Seed tiers. creem_product_id left NULL — master fills externally.
INSERT INTO public.subscription_tiers
  (slug, name, price_usd, billing_interval, unlimited_hearts, lover_mode, perks, sort_order)
VALUES
  ('deeper', 'Deeper Talk', 9.99, 'month', true, false,
    '["무제한 대화", "더 긴 답장", "기억 우선 반영"]'::jsonb, 1),
  ('lover',  'Lover Mode',  19.99, 'month', true, true,
    '["무제한 대화", "연인 모드 잠금 해제", "독점 셀피 빈도 ↑", "기념일 기억"]'::jsonb, 2)
ON CONFLICT (slug) DO NOTHING;

-- ── 4. User subscriptions ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tier_id uuid NOT NULL REFERENCES public.subscription_tiers(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'past_due', 'canceled', 'expired')),
  -- Creem linkage (external system owns billing cycle)
  creem_checkout_id text,
  creem_subscription_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  started_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One non-terminal subscription row per user at a time (partial unique).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_subscription_per_user
  ON public.subscriptions(user_id)
  WHERE status IN ('pending', 'active', 'past_due');

CREATE INDEX IF NOT EXISTS idx_sub_user ON public.subscriptions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_sub_creem_checkout ON public.subscriptions(creem_checkout_id) WHERE creem_checkout_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sub_creem_sub ON public.subscriptions(creem_subscription_id) WHERE creem_subscription_id IS NOT NULL;

COMMENT ON TABLE public.subscriptions IS 'User subscription state. Billing cycle managed by Creem; we mirror status via webhook.';

-- ── 5. Spending guard (per user) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.user_spending_guard (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Rolling daily window (UTC date)
  spend_window_date date,
  spend_today_usd numeric(10,2) NOT NULL DEFAULT 0,
  purchases_today integer NOT NULL DEFAULT 0,
  last_purchase_at timestamptz,
  -- User-adjustable cap, default conservative. Hard ceiling enforced in RPC.
  daily_cap_usd numeric(10,2) NOT NULL DEFAULT 50.00,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_spending_guard IS 'Per-user spend guardrail: daily cap + rapid-purchase cooldown. Protects solo operator from chargeback/refund risk.';
COMMENT ON COLUMN public.user_spending_guard.daily_cap_usd IS 'User-facing daily spend cap. RPC also enforces a hard system ceiling regardless of this value.';

-- ── 6. Payment intent log (audit) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_intent_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('gift', 'subscription')),
  ref_slug text NOT NULL,          -- gift slug or tier slug
  amount_usd numeric(10,2) NOT NULL,
  -- Where the intent originated, for funnel analysis
  surface text,                    -- 'inline_gift' | 'upgrade_prompt' | 'gift_sheet'
  -- Result of the guard check at intent time
  guard_result text NOT NULL CHECK (guard_result IN ('allowed', 'blocked_age', 'blocked_cap', 'blocked_cooldown')),
  intimacy_stage integer,
  character_id uuid REFERENCES public.characters(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pintent_user ON public.payment_intent_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pintent_surface ON public.payment_intent_log(surface, created_at DESC);

COMMENT ON TABLE public.payment_intent_log IS 'Every intent-to-pay event (incl. blocked). Funnel + compliance audit. Not a payment record.';

-- ── 7. RPC: derive stage from score ────────────────────────
CREATE OR REPLACE FUNCTION public.intimacy_stage_for_score(p_score integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_score >= 350 THEN 4
    WHEN p_score >= 180 THEN 3
    WHEN p_score >= 80  THEN 2
    WHEN p_score >= 30  THEN 1
    ELSE 0
  END;
$$;

-- ── 8. RPC: bump intimacy ──────────────────────────────────
-- Adds points, recomputes stage. Returns jsonb with new score/stage and
-- whether a stage-up just happened (the upgrade trigger).
CREATE OR REPLACE FUNCTION public.bump_intimacy(
  p_conversation_id uuid,
  p_points integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_stage integer;
  v_new_score integer;
  v_new_stage integer;
BEGIN
  UPDATE public.conversations
  SET intimacy_score = intimacy_score + GREATEST(p_points, 0),
      updated_at = now()
  WHERE id = p_conversation_id
  RETURNING intimacy_stage, intimacy_score INTO v_old_stage, v_new_score;

  IF v_new_score IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  v_new_stage := public.intimacy_stage_for_score(v_new_score);

  IF v_new_stage <> v_old_stage THEN
    UPDATE public.conversations
    SET intimacy_stage = v_new_stage
    WHERE id = p_conversation_id;
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'score', v_new_score,
    'stage', v_new_stage,
    'staged_up', v_new_stage > v_old_stage
  );
END;
$$;

-- ── 9. RPC: has active subscription ────────────────────────
CREATE OR REPLACE FUNCTION public.get_active_subscription(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
BEGIN
  SELECT s.status, s.current_period_end, t.slug, t.unlimited_hearts, t.lover_mode, t.name
  INTO v_row
  FROM public.subscriptions s
  JOIN public.subscription_tiers t ON t.id = s.tier_id
  WHERE s.user_id = p_user_id
    AND s.status = 'active'
    AND (s.current_period_end IS NULL OR s.current_period_end > now())
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF v_row IS NULL THEN
    RETURN jsonb_build_object('active', false, 'unlimited_hearts', false, 'lover_mode', false);
  END IF;

  RETURN jsonb_build_object(
    'active', true,
    'tier', v_row.slug,
    'tier_name', v_row.name,
    'unlimited_hearts', v_row.unlimited_hearts,
    'lover_mode', v_row.lover_mode,
    'current_period_end', v_row.current_period_end
  );
END;
$$;

-- ── 10. RPC: spending guard check + reserve ────────────────
-- Atomically checks age gate, daily cap, and cooldown, and (if allowed)
-- records the spend optimistically. Returns the guard decision.
-- HARD_CEILING and COOLDOWN are system-enforced regardless of user cap.
CREATE OR REPLACE FUNCTION public.check_and_reserve_spend(
  p_user_id uuid,
  p_amount_usd numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_guard public.user_spending_guard%ROWTYPE;
  v_is_adult boolean;
  v_hard_ceiling numeric := 200.00;   -- system hard ceiling / day
  v_cooldown_seconds integer := 20;   -- min seconds between purchases
  v_effective_cap numeric;
  v_seconds_since_last numeric;
BEGIN
  -- Age gate
  SELECT age_verified_adult INTO v_is_adult FROM public.profiles WHERE id = p_user_id;
  IF v_is_adult IS NOT TRUE THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'blocked_age');
  END IF;

  -- Ensure guard row
  INSERT INTO public.user_spending_guard (user_id, spend_window_date)
  VALUES (p_user_id, v_today)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_guard FROM public.user_spending_guard WHERE user_id = p_user_id FOR UPDATE;

  -- Roll the daily window
  IF v_guard.spend_window_date IS DISTINCT FROM v_today THEN
    v_guard.spend_today_usd := 0;
    v_guard.purchases_today := 0;
    v_guard.spend_window_date := v_today;
  END IF;

  -- Cooldown (rapid purchase)
  IF v_guard.last_purchase_at IS NOT NULL THEN
    v_seconds_since_last := EXTRACT(EPOCH FROM (now() - v_guard.last_purchase_at));
    IF v_seconds_since_last < v_cooldown_seconds THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'reason', 'blocked_cooldown',
        'retry_after_seconds', CEIL(v_cooldown_seconds - v_seconds_since_last)
      );
    END IF;
  END IF;

  -- Effective cap = min(user cap, hard ceiling)
  v_effective_cap := LEAST(v_guard.daily_cap_usd, v_hard_ceiling);

  IF v_guard.spend_today_usd + p_amount_usd > v_effective_cap THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'blocked_cap',
      'spent_today', v_guard.spend_today_usd,
      'cap', v_effective_cap
    );
  END IF;

  -- Reserve (optimistic). Webhook confirms actual payment separately.
  UPDATE public.user_spending_guard
  SET spend_today_usd = v_guard.spend_today_usd + p_amount_usd,
      purchases_today = v_guard.purchases_today + 1,
      spend_window_date = v_today,
      last_purchase_at = now(),
      updated_at = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'allowed', true,
    'spent_today', v_guard.spend_today_usd + p_amount_usd,
    'cap', v_effective_cap
  );
END;
$$;

-- ── 11. consume_heart override: unlimited for active subs ──
-- Subscribers with unlimited_hearts never deplete. Returns a large sentinel
-- balance (>=0) so the chat flow treats them as always-allowed.
CREATE OR REPLACE FUNCTION public.consume_heart(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance integer;
  v_unlimited boolean;
BEGIN
  SELECT (public.get_active_subscription(p_user_id) ->> 'unlimited_hearts')::boolean
  INTO v_unlimited;

  IF v_unlimited IS TRUE THEN
    RETURN 9999;  -- sentinel: unlimited, do not deplete
  END IF;

  UPDATE public.user_hearts
  SET balance = balance - 1,
      total_spent = total_spent + 1,
      updated_at = now()
  WHERE user_id = p_user_id AND balance > 0
  RETURNING balance INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RETURN -1;
  END IF;

  RETURN v_new_balance;
END;
$$;

-- ── 12. RLS ────────────────────────────────────────────────
ALTER TABLE public.subscription_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_spending_guard ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_intent_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active tiers" ON public.subscription_tiers;
CREATE POLICY "Anyone can view active tiers"
  ON public.subscription_tiers FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Users can view own subscription" ON public.subscriptions;
CREATE POLICY "Users can view own subscription"
  ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own spending guard" ON public.user_spending_guard;
CREATE POLICY "Users can view own spending guard"
  ON public.user_spending_guard FOR SELECT USING (auth.uid() = user_id);

-- payment_intent_log: no client SELECT (service-role only). No policy = deny.

-- ── 13. Backfill spending guard for existing users ─────────
INSERT INTO public.user_spending_guard (user_id, spend_window_date)
SELECT id, (now() AT TIME ZONE 'UTC')::date FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;
