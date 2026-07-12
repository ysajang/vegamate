-- Funnel event instrumentation (Notion §34): measure the signup → first-chat
-- activation gap (3/8 ad signups churned with zero messages; no event data
-- existed to localize the drop-off).
-- Additive only: new table, no changes to existing objects.

create table if not exists public.funnel_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_name text not null check (
    event_name in ('signup_complete', 'chat_enter', 'first_message_sent', 'gift_sheet_open')
  ),
  metadata jsonb,
  created_at timestamptz not null default now()
);

comment on table public.funnel_events is
  'Activation funnel events (client inserts with user auth; operator reads via service role). Notion §34.';

create index if not exists funnel_events_user_id_idx on public.funnel_events (user_id);
create index if not exists funnel_events_event_name_created_at_idx
  on public.funnel_events (event_name, created_at desc);

-- One-shot events are idempotent at the DB level: retries / multi-device /
-- resume-path double-fires collapse to a single row. This also makes the
-- 24h "no first message" query a simple NOT EXISTS.
create unique index if not exists funnel_events_one_shot_uniq
  on public.funnel_events (user_id, event_name)
  where event_name in ('signup_complete', 'first_message_sent');

alter table public.funnel_events enable row level security;

-- Users may only insert rows as themselves. No select/update/delete policies:
-- reading is operator-only via the service role (bypasses RLS).
create policy funnel_events_insert_own on public.funnel_events
  for insert to authenticated
  with check (auth.uid() = user_id);

revoke all on public.funnel_events from anon;
grant insert on public.funnel_events to authenticated;
