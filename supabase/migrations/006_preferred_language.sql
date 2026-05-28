-- 006: Add preferred_language to profiles for proactive message localization
-- Default 'en' (English). Client or language-detection logic updates this.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_language text NOT NULL DEFAULT 'en';

COMMENT ON COLUMN public.profiles.preferred_language
  IS 'ISO 639-1 language code for proactive messages. Detected from recent messages or set by user. Default: en';

-- Index for cron query filtering
CREATE INDEX IF NOT EXISTS idx_profiles_preferred_language
  ON public.profiles (preferred_language);
