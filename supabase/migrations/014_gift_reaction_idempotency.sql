-- Gift-reaction idempotency hardening.
--
-- The capture endpoint and the PayPal webhook can race fulfillGiftTransaction
-- within a millisecond window (both read status='pending' before either
-- writes 'completed'). The application-level guard in sendGiftReaction is
-- check-then-insert, which shares that window. This partial unique index
-- closes it at the database level: a second concurrent reaction insert for
-- the same gift_tx_id fails with a unique violation, which the caller
-- already treats as non-fatal (logs and returns).
--
-- Partial (WHERE clause) so ordinary messages are unaffected.

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_gift_reaction_tx
  ON public.messages ((metadata->>'gift_tx_id'))
  WHERE metadata->>'gift_tx_id' IS NOT NULL;
