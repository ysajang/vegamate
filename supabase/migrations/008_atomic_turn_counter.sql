-- 008_atomic_turn_counter.sql
-- Fixes a race condition in memory turn counting.
--
-- The previous incrementTurnCounter did read-then-write in two steps from the
-- application layer. Inside Next.js after() callbacks these ran concurrently
-- for rapid successive messages, so multiple callbacks read the same value and
-- wrote the same +1 — the counter lagged far behind the real turn count and
-- the extraction threshold (EXTRACTION_INTERVAL = 5) was effectively never
-- reached, leaving user_memory empty.
--
-- This RPC performs the increment atomically in a single statement and returns
-- the post-increment value.

create or replace function public.increment_turn_counter(p_conversation_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.conversations
  set memory_turn_counter = memory_turn_counter + 1
  where id = p_conversation_id
  returning memory_turn_counter;
$$;
