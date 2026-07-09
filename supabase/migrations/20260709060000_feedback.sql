-- In-app feedback (replaces the mailto: flow that silently failed for PWA
-- users without a configured mail client).
-- Additive only: new table, no changes to existing objects.

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null check (category in ('general', 'payment', 'bug', 'other')),
  message text not null check (char_length(message) between 1 and 5000),
  context jsonb,
  created_at timestamptz not null default now()
);

comment on table public.feedback is 'In-app user feedback (API inserts with user auth; operator reads via service role)';

create index if not exists feedback_created_at_idx on public.feedback (created_at desc);
create index if not exists feedback_user_id_idx on public.feedback (user_id);

alter table public.feedback enable row level security;

-- Users may only insert rows as themselves. No select/update/delete policies:
-- reading is operator-only via the service role (bypasses RLS).
create policy feedback_insert_own on public.feedback
  for insert to authenticated
  with check (auth.uid() = user_id);

revoke all on public.feedback from anon;
grant insert on public.feedback to authenticated;
