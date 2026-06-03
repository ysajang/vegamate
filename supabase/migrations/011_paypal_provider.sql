-- 011: PayPal provider support
-- Creem store was rejected; PayPal becomes the active provider. Creem columns
-- are kept untouched. All statements idempotent (safe re-run).

-- Gift transactions: PayPal order/capture linkage
ALTER TABLE public.gift_transactions
  ADD COLUMN IF NOT EXISTS paypal_order_id text,
  ADD COLUMN IF NOT EXISTS paypal_capture_id text;

CREATE INDEX IF NOT EXISTS idx_gift_tx_paypal_order
  ON public.gift_transactions(paypal_order_id) WHERE paypal_order_id IS NOT NULL;

-- Subscriptions: PayPal subscription linkage
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS paypal_subscription_id text;

CREATE INDEX IF NOT EXISTS idx_sub_paypal_sub
  ON public.subscriptions(paypal_subscription_id) WHERE paypal_subscription_id IS NOT NULL;

-- Tiers: PayPal billing plan id (filled by scripts/paypal-create-plans.mjs or dashboard)
ALTER TABLE public.subscription_tiers
  ADD COLUMN IF NOT EXISTS paypal_plan_id text;

COMMENT ON COLUMN public.subscription_tiers.paypal_plan_id IS
  'PayPal Billing Plan id (P-...). Sandbox/live use different plans; value matches current PAYPAL_ENV.';

-- Webhook event idempotency ledger (provider-agnostic)
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_id text NOT NULL,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);

COMMENT ON TABLE public.webhook_events IS
  'Processed webhook event ids for idempotency. Insert-first; unique violation = duplicate delivery, skip.';

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
-- service-role only; no policies = client deny-all
