-- ============================================================
-- VegaMate Memory System Migration
-- user_memory: stores extracted facts about users per character
-- ============================================================

-- ── ENUM type for memory classification ─────────────────────
create type memory_type as enum ('fact', 'preference', 'event', 'emotion');

-- ── user_memory table ───────────────────────────────────────
create table public.user_memory (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  memory_key text not null,            -- e.g. "name", "job", "hobby", "pet_name"
  memory_value text not null,          -- e.g. "승재", "개발자", "게임", "코코"
  memory_type memory_type not null default 'fact',
  confidence float not null default 0.8
    check (confidence >= 0.0 and confidence <= 1.0),
  source_message_id uuid references public.messages(id) on delete set null,
  extraction_batch_id text,            -- groups memories extracted in same batch
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Indexes ─────────────────────────────────────────────────
-- Primary lookup: user + character active memories
create index idx_user_memory_lookup
  on public.user_memory(user_id, character_id, updated_at desc)
  where is_active = true;

-- Dedup check: same user + character + key
create unique index idx_user_memory_unique_key
  on public.user_memory(user_id, character_id, memory_key)
  where is_active = true;

-- By type for filtered queries
create index idx_user_memory_type
  on public.user_memory(user_id, character_id, memory_type)
  where is_active = true;

comment on table public.user_memory is 'Extracted user facts per character. One active row per user+character+key.';
comment on column public.user_memory.memory_key is 'Normalized key like name, job, hobby, pet_name, recent_event, mood';
comment on column public.user_memory.confidence is '0.0-1.0 extraction confidence from LLM';
comment on column public.user_memory.extraction_batch_id is 'Groups memories from same extraction call for debugging';

-- ── Updated_at trigger ──────────────────────────────────────
create trigger set_updated_at before update on public.user_memory
  for each row execute function public.update_updated_at();

-- ── RLS ─────────────────────────────────────────────────────
alter table public.user_memory enable row level security;

-- Users can view their own memories (for future "memory management" UI)
create policy "Users can view own memories"
  on public.user_memory for select using (auth.uid() = user_id);

-- No public insert/update/delete -> service role only (extraction runs server-side)

-- ── Upsert function (server-side only) ──────────────────────
-- Handles insert-or-update logic atomically
create or replace function public.upsert_user_memory(
  p_user_id uuid,
  p_character_id uuid,
  p_memory_key text,
  p_memory_value text,
  p_memory_type memory_type default 'fact',
  p_confidence float default 0.8,
  p_source_message_id uuid default null,
  p_batch_id text default null
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_memory_id uuid;
begin
  -- Try update existing active memory with same key
  update public.user_memory
  set
    memory_value = p_memory_value,
    memory_type = p_memory_type,
    confidence = greatest(confidence, p_confidence),  -- keep higher confidence
    source_message_id = coalesce(p_source_message_id, source_message_id),
    extraction_batch_id = coalesce(p_batch_id, extraction_batch_id),
    updated_at = now()
  where user_id = p_user_id
    and character_id = p_character_id
    and memory_key = p_memory_key
    and is_active = true
  returning id into v_memory_id;

  -- If no existing row, insert new
  if v_memory_id is null then
    insert into public.user_memory (
      user_id, character_id, memory_key, memory_value,
      memory_type, confidence, source_message_id, extraction_batch_id
    ) values (
      p_user_id, p_character_id, p_memory_key, p_memory_value,
      p_memory_type, p_confidence, p_source_message_id, p_batch_id
    )
    returning id into v_memory_id;
  end if;

  return v_memory_id;
end;
$$;

-- ── Fetch memories for injection ────────────────────────────
-- Returns recent 20 + top 10 highest confidence (deduped)
create or replace function public.get_user_memories(
  p_user_id uuid,
  p_character_id uuid,
  p_limit integer default 30
)
returns table (
  memory_key text,
  memory_value text,
  memory_type memory_type,
  confidence float,
  updated_at timestamptz
)
language plpgsql
security definer
stable
as $$
begin
  return query
  with recent as (
    select um.memory_key, um.memory_value, um.memory_type,
           um.confidence, um.updated_at,
           row_number() over (order by um.updated_at desc) as rn_recent
    from public.user_memory um
    where um.user_id = p_user_id
      and um.character_id = p_character_id
      and um.is_active = true
  ),
  top_confidence as (
    select um.memory_key, um.memory_value, um.memory_type,
           um.confidence, um.updated_at,
           row_number() over (order by um.confidence desc, um.updated_at desc) as rn_conf
    from public.user_memory um
    where um.user_id = p_user_id
      and um.character_id = p_character_id
      and um.is_active = true
  ),
  combined as (
    select r.memory_key, r.memory_value, r.memory_type, r.confidence, r.updated_at
    from recent r where r.rn_recent <= 20
    union
    select t.memory_key, t.memory_value, t.memory_type, t.confidence, t.updated_at
    from top_confidence t where t.rn_conf <= 10
  )
  select distinct on (c.memory_key)
    c.memory_key, c.memory_value, c.memory_type, c.confidence, c.updated_at
  from combined c
  order by c.memory_key, c.updated_at desc
  limit p_limit;
end;
$$;

-- ── Memory count tracking on conversations ──────────────────
-- Add memory_extraction_count to track batch extraction timing
alter table public.conversations
  add column if not exists memory_turn_counter integer not null default 0;

comment on column public.conversations.memory_turn_counter is 'Counts user messages since last memory extraction. Resets to 0 after extraction.';
