-- Defense in depth: default privileges auto-granted ALL to authenticated.
-- RLS already blocks (no select/update/delete policies), but narrow the
-- grant surface to insert-only as designed.
revoke all on public.funnel_events from authenticated;
grant insert on public.funnel_events to authenticated;
