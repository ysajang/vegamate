-- ============================================================
-- P3: Proactive Message Engine - Schema Changes
-- ============================================================

-- 1. Add is_proactive flag to messages
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS is_proactive boolean NOT NULL DEFAULT false;

-- Index for filtering proactive messages per conversation
CREATE INDEX IF NOT EXISTS idx_messages_proactive
  ON public.messages (conversation_id, is_proactive)
  WHERE is_proactive = true;

-- 2. Proactive message log (tracks sends per user per day for throttling)
CREATE TABLE IF NOT EXISTS public.proactive_message_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  category text NOT NULL,
  has_selfie boolean NOT NULL DEFAULT false,
  selfie_rarity text,
  tokens_used integer NOT NULL DEFAULT 0,
  sent_at timestamptz NOT NULL DEFAULT now()
);

-- Index for daily count check (user + date)
CREATE INDEX IF NOT EXISTS idx_proactive_log_user_daily
  ON public.proactive_message_log (user_id, sent_at DESC);

-- Index for consecutive-send check (did user respond between sends?)
CREATE INDEX IF NOT EXISTS idx_proactive_log_character_user
  ON public.proactive_message_log (user_id, character_id, sent_at DESC);

-- 3. Add timezone to profiles (default UTC)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC';

-- 4. RLS for proactive_message_log
ALTER TABLE public.proactive_message_log ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (cron runs as service role)
CREATE POLICY "Service role full access on proactive_message_log"
  ON public.proactive_message_log
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Users can read their own logs
CREATE POLICY "Users can read own proactive logs"
  ON public.proactive_message_log
  FOR SELECT
  USING (auth.uid() = user_id);

-- 5. Update messages RLS to allow service role inserts for proactive
-- (service role already bypasses RLS, so this is for documentation)

COMMENT ON TABLE public.proactive_message_log IS 'Tracks proactive messages sent to users for throttling and analytics';
COMMENT ON COLUMN public.messages.is_proactive IS 'True if this message was sent proactively by cron, not in response to user input';
COMMENT ON COLUMN public.profiles.timezone IS 'User timezone string (e.g. Asia/Seoul, America/New_York). Set by client.';
