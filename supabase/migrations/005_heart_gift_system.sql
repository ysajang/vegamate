-- ============================================================
-- P0: Heart + Gift System
-- Replaces credit system with hearts (free daily) + gifts (paid)
-- Old tables (credit_transactions, profiles.credit_balance) preserved
-- ============================================================

-- ── 1. gifts (master table) ────────────────────────────────
CREATE TABLE public.gifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  emoji text NOT NULL,
  price_usd numeric(10,2) NOT NULL,
  hearts_value integer NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  -- For randomized gifts (surprise box)
  hearts_min integer,
  hearts_max integer,
  -- Creem product ID (set after creating products in Creem dashboard)
  creem_product_id text,
  -- Character hint pattern (for AI prompt)
  hint_pattern text NOT NULL,
  -- Whether character can "ask" for this gift
  is_requestable boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.gifts IS 'Gift master table. 12 gift types that users buy for their AI companion.';
COMMENT ON COLUMN public.gifts.slug IS 'URL-safe identifier: coffee, cake, ring, etc.';
COMMENT ON COLUMN public.gifts.hearts_value IS 'Hearts credited on purchase. For surprise gift, actual value is random between hearts_min and hearts_max.';
COMMENT ON COLUMN public.gifts.hint_pattern IS 'AI hint text for gift-asking behavior e.g. "커피 마시고 싶어"';
COMMENT ON COLUMN public.gifts.is_requestable IS 'If false (e.g. ring), character never asks for it. User discovers on their own.';

-- ── 2. user_hearts ─────────────────────────────────────────
CREATE TABLE public.user_hearts (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0,
  last_daily_claim timestamptz,
  consecutive_days integer NOT NULL DEFAULT 0,
  total_earned integer NOT NULL DEFAULT 0,
  total_spent integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_hearts_balance ON public.user_hearts(balance) WHERE balance > 0;

COMMENT ON TABLE public.user_hearts IS 'Heart balance per user. Source of truth for chat access. Replaces profiles.credit_balance.';
COMMENT ON COLUMN public.user_hearts.consecutive_days IS 'Streak of consecutive daily claims. Affects bonus heart amount.';
COMMENT ON COLUMN public.user_hearts.last_daily_claim IS 'UTC timestamp of last daily heart claim. Used to check once-per-day.';

-- ── 3. gift_transactions ───────────────────────────────────
CREATE TABLE public.gift_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  gift_id uuid NOT NULL REFERENCES public.gifts(id) ON DELETE RESTRICT,
  hearts_granted integer NOT NULL,
  creem_checkout_id text,
  creem_payment_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_gift_tx_user ON public.gift_transactions(user_id, created_at DESC);
CREATE INDEX idx_gift_tx_status ON public.gift_transactions(status) WHERE status = 'pending';
CREATE INDEX idx_gift_tx_creem ON public.gift_transactions(creem_checkout_id) WHERE creem_checkout_id IS NOT NULL;

COMMENT ON TABLE public.gift_transactions IS 'Records every gift purchase. Links to Creem payment.';

-- ── 4. Seed gift master data ───────────────────────────────
INSERT INTO public.gifts (slug, name, emoji, price_usd, hearts_value, sort_order, hint_pattern, is_requestable) VALUES
  ('coffee',    'Coffee',    '☕', 0.99,  15,  1,  '커피 마시고 싶어',             true),
  ('milktea',   'Milk Tea',  '🧋', 0.99,  15,  2,  '목 마르다',                    true),
  ('cake',      'Cake',      '🍰', 1.99,  30,  3,  '단 거 먹고 싶다',              true),
  ('book',      'Book',      '📖', 2.99,  40,  4,  '이 책 읽고 싶은데',            true),
  ('movie',     'Movie',     '🎬', 2.99,  40,  5,  '같이 영화 보고 싶다',          true),
  ('flowers',   'Flowers',   '💐', 4.99,  80,  6,  '꽃 예쁘다...',                 true),
  ('plushie',   'Plushie',   '🧸', 4.99,  80,  7,  '이거 귀엽지 않아?',            true),
  ('clothes',   'Clothes',   '👗', 9.99, 150,  8,  '이 옷 어때?',                  true),
  ('airpods',   'AirPods',   '🎧', 9.99, 150,  9,  '음악 같이 듣고 싶다',          true),
  ('dinner',    'Dinner',    '🍽️', 14.99, 250, 10, '오늘 특별한 거 먹고 싶어',     true),
  ('ring',      'Ring',      '💍', 29.99, 500, 11, '',                             false),
  ('surprise',  'Surprise',  '🎁', 4.99,   0, 12, '',                             false);

-- Surprise gift has random hearts
UPDATE public.gifts SET hearts_min = 40, hearts_max = 150 WHERE slug = 'surprise';

-- ── 5. RPC: claim_daily_hearts ─────────────────────────────
-- Returns: { claimed: bool, amount: int, consecutive_days: int, balance: int }
CREATE OR REPLACE FUNCTION public.claim_daily_hearts(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row public.user_hearts%ROWTYPE;
  v_today date;
  v_last_claim_date date;
  v_new_consecutive integer;
  v_amount integer;
  v_new_balance integer;
BEGIN
  v_today := (now() AT TIME ZONE 'UTC')::date;

  -- Get or create user_hearts row
  INSERT INTO public.user_hearts (user_id, balance)
  VALUES (p_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_row FROM public.user_hearts WHERE user_id = p_user_id FOR UPDATE;

  -- Check if already claimed today
  IF v_row.last_daily_claim IS NOT NULL THEN
    v_last_claim_date := (v_row.last_daily_claim AT TIME ZONE 'UTC')::date;
    IF v_last_claim_date = v_today THEN
      RETURN jsonb_build_object(
        'claimed', false,
        'amount', 0,
        'consecutive_days', v_row.consecutive_days,
        'balance', v_row.balance
      );
    END IF;
  END IF;

  -- Calculate consecutive days
  IF v_row.last_daily_claim IS NOT NULL AND v_last_claim_date = v_today - 1 THEN
    v_new_consecutive := v_row.consecutive_days + 1;
  ELSE
    v_new_consecutive := 1;
  END IF;

  -- Calculate hearts amount based on streak
  IF v_new_consecutive >= 7 THEN
    -- 7+ days: 5-15, with 5% chance of 20
    IF random() < 0.05 THEN
      v_amount := 20;
    ELSE
      v_amount := 5 + floor(random() * 11)::integer;  -- 5..15
    END IF;
  ELSIF v_new_consecutive >= 3 THEN
    -- 3-6 days: 5-15
    v_amount := 5 + floor(random() * 11)::integer;  -- 5..15
  ELSE
    -- 1-2 days: 3-8
    v_amount := 3 + floor(random() * 6)::integer;   -- 3..8
  END IF;

  v_new_balance := v_row.balance + v_amount;

  -- Update
  UPDATE public.user_hearts SET
    balance = v_new_balance,
    last_daily_claim = now(),
    consecutive_days = v_new_consecutive,
    total_earned = total_earned + v_amount,
    updated_at = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'claimed', true,
    'amount', v_amount,
    'consecutive_days', v_new_consecutive,
    'balance', v_new_balance
  );
END;
$$;

-- ── 6. RPC: consume_heart ──────────────────────────────────
-- Deduct 1 heart for a chat turn. Returns new balance or -1 if insufficient.
CREATE OR REPLACE FUNCTION public.consume_heart(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_balance integer;
BEGIN
  UPDATE public.user_hearts
  SET
    balance = balance - 1,
    total_spent = total_spent + 1,
    updated_at = now()
  WHERE user_id = p_user_id AND balance > 0
  RETURNING balance INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RETURN -1;  -- insufficient hearts
  END IF;

  RETURN v_new_balance;
END;
$$;

-- ── 7. RPC: add_hearts ─────────────────────────────────────
-- Add hearts after gift purchase. Returns new balance.
CREATE OR REPLACE FUNCTION public.add_hearts(
  p_user_id uuid,
  p_amount integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_balance integer;
BEGIN
  -- Ensure row exists
  INSERT INTO public.user_hearts (user_id, balance)
  VALUES (p_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.user_hearts
  SET
    balance = balance + p_amount,
    total_earned = total_earned + p_amount,
    updated_at = now()
  WHERE user_id = p_user_id
  RETURNING balance INTO v_new_balance;

  RETURN v_new_balance;
END;
$$;

-- ── 8. Update handle_new_user to create user_hearts ────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  );

  -- Create heart balance with initial daily hearts (5)
  INSERT INTO public.user_hearts (user_id, balance, total_earned)
  VALUES (new.id, 5, 5);

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 9. RLS ─────────────────────────────────────────────────
ALTER TABLE public.gifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_hearts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_transactions ENABLE ROW LEVEL SECURITY;

-- Gifts: everyone can read active gifts
CREATE POLICY "Anyone can view active gifts"
  ON public.gifts FOR SELECT USING (is_active = true);

-- User hearts: users can read their own
CREATE POLICY "Users can view own hearts"
  ON public.user_hearts FOR SELECT USING (auth.uid() = user_id);

-- Gift transactions: users can read their own
CREATE POLICY "Users can view own gift transactions"
  ON public.gift_transactions FOR SELECT USING (auth.uid() = user_id);

-- ── 10. Create user_hearts for existing users ──────────────
INSERT INTO public.user_hearts (user_id, balance, total_earned)
SELECT id, 5, 5 FROM public.profiles
WHERE id NOT IN (SELECT user_id FROM public.user_hearts)
ON CONFLICT (user_id) DO NOTHING;
