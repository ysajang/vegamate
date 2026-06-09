-- ============================================================
-- VegaMate MVP Schema Migration
-- Run in Supabase SQL Editor (or as migration file)
-- ============================================================

-- ── Enable required extensions ──────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";  -- for text search on messages

-- ── ENUM types ──────────────────────────────────────────────
create type selfie_rarity as enum ('common', 'uncommon', 'rare', 'epic', 'legendary');
create type selfie_trigger_type as enum (
  'emotion_peak',      -- 감정 고조 (고백/칭찬/감사)
  'location_mention',  -- 장소 이동 언급
  'message_count',     -- 일정 메시지 수 이후 랜덤
  'greeting',          -- 아침/저녁 인사
  'keyword',           -- 키워드 기반 ("보고 싶었어" 등)
  'comeback',          -- 유저 오랜만에 복귀
  'random'             -- 랜덤 트리거
);
create type message_role as enum ('user', 'assistant', 'system');
create type message_content_type as enum ('text', 'selfie', 'text_with_selfie');
create type credit_tx_type as enum ('purchase', 'consume_chat', 'consume_selfie', 'bonus', 'refund');
create type credit_tx_status as enum ('pending', 'completed', 'failed', 'refunded');

-- ── 1. profiles ─────────────────────────────────────────────
-- Extends Supabase auth.users with app-specific data
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  credit_balance integer not null default 50,  -- 신규 가입 무료 크레딧
  total_messages_sent integer not null default 0,
  total_selfies_received integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'User profile extending Supabase auth. credit_balance is source of truth for available credits.';
comment on column public.profiles.credit_balance is 'Current credit balance. 50 free on signup. Consumed by chat (1/msg) and selfie receipt (3/selfie).';

-- Auto-create profile on auth signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 2. characters ───────────────────────────────────────────
create table public.characters (
  id uuid primary key default uuid_generate_v4(),
  slug text not null unique,                    -- e.g. 'hana', 'minjun'
  name text not null,                           -- display name
  gender text not null check (gender in ('female', 'male')),
  persona_prompt text not null,                 -- system prompt for LLM
  greeting_message text not null,               -- first message when selected
  avatar_url text not null,                     -- profile pic URL
  personality_tags text[] not null default '{}', -- e.g. {'playful', 'caring', 'witty'}
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.characters is 'AI companion characters. MVP: 4 characters (2F + 2M).';

-- ── 3. selfie_pool ──────────────────────────────────────────
-- Pre-generated selfie images per character
create table public.selfie_pool (
  id uuid primary key default uuid_generate_v4(),
  character_id uuid not null references public.characters(id) on delete cascade,
  image_url text not null,                      -- Supabase Storage URL
  thumbnail_url text,                           -- smaller version for chat bubble
  rarity selfie_rarity not null default 'common',
  scene text not null default 'default',        -- e.g. 'cafe', 'gym', 'morning', 'beach'
  expression text not null default 'smile',     -- e.g. 'smile', 'wink', 'shy', 'surprised'
  outfit text,                                  -- e.g. 'casual', 'formal', 'swimwear'
  time_of_day text check (time_of_day in ('morning', 'afternoon', 'evening', 'night')),
  trigger_contexts selfie_trigger_type[] not null default '{random}',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_selfie_pool_character on public.selfie_pool(character_id) where is_active = true;
create index idx_selfie_pool_rarity on public.selfie_pool(character_id, rarity);

comment on table public.selfie_pool is 'Pre-generated selfie images. ~20-30 per character. No realtime generation in MVP.';
comment on column public.selfie_pool.trigger_contexts is 'Which trigger types this selfie is appropriate for. Used by selfie selection logic.';

-- ── 4. conversations ────────────────────────────────────────
create table public.conversations (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  last_message_at timestamptz,
  last_user_message_at timestamptz,             -- 유저의 마지막 메시지 시각 (활동 추적)
  message_count integer not null default 0,
  selfie_count integer not null default 0,
  ai_engagement_level integer not null default 5 check (ai_engagement_level between 0 and 10),
  -- 0 = AI 조용히 / 5 = 보통 / 10 = 매우 적극적
  -- 유저 반응 패턴에 따라 동적 조절
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(user_id, character_id)
);

create index idx_conversations_user on public.conversations(user_id) where is_active = true;
create index idx_conversations_last_user_msg on public.conversations(last_user_message_at)
  where is_active = true;

comment on table public.conversations is 'One conversation per user-character pair. ai_engagement_level controls proactive behavior.';
comment on column public.conversations.ai_engagement_level is '0=silent, 5=normal, 10=very proactive. Dynamically adjusted based on user response patterns.';

-- ── 5. messages ─────────────────────────────────────────────
create table public.messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role message_role not null,
  content_type message_content_type not null default 'text',
  content text not null,                        -- text content (or caption for selfie)
  selfie_id uuid references public.selfie_pool(id) on delete set null,
  selfie_rarity selfie_rarity,                  -- denormalized for quick display
  credits_consumed integer not null default 0,
  metadata jsonb,                               -- flexible field: trigger_type, emotion_score, etc.
  created_at timestamptz not null default now()
);

create index idx_messages_conversation on public.messages(conversation_id, created_at desc);
create index idx_messages_selfies on public.messages(conversation_id)
  where selfie_id is not null;

comment on table public.messages is 'Chat messages. Both user and AI messages. Selfie messages include selfie_id reference.';
comment on column public.messages.metadata is 'Flexible JSON: {trigger_type, emotion_score, model_used, tokens_used, response_time_ms}';

-- ── 6. user_selfie_collection ───────────────────────────────
-- Track which selfies a user has received (gallery/collection feature)
create table public.user_selfie_collection (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  selfie_id uuid not null references public.selfie_pool(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  rarity selfie_rarity not null,
  is_favorite boolean not null default false,
  obtained_at timestamptz not null default now(),

  unique(user_id, selfie_id)
);

create index idx_collection_user on public.user_selfie_collection(user_id, obtained_at desc);
create index idx_collection_user_char on public.user_selfie_collection(user_id, character_id);

comment on table public.user_selfie_collection is 'Gallery of selfies received by user. Unique constraint prevents duplicates.';

-- ── 7. credit_transactions ──────────────────────────────────
create table public.credit_transactions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tx_type credit_tx_type not null,
  amount integer not null,                      -- positive = add, negative = consume
  balance_after integer not null,               -- snapshot of balance after transaction
  description text,                             -- human-readable description
  -- Payment provider fields (Creem)
  provider_order_id text,                       -- Creem order/checkout ID
  provider_product_id text,                     -- Creem product ID
  price_usd numeric(10,2),                      -- USD amount paid (null for non-purchase)
  status credit_tx_status not null default 'completed',
  metadata jsonb,                               -- {package_name, bonus_amount, etc.}
  created_at timestamptz not null default now()
);

create index idx_credit_tx_user on public.credit_transactions(user_id, created_at desc);
create index idx_credit_tx_provider on public.credit_transactions(provider_order_id)
  where provider_order_id is not null;

comment on table public.credit_transactions is 'Immutable ledger of all credit changes. profiles.credit_balance is the cached total.';

-- ── 8. push_subscriptions ───────────────────────────────────
create table public.push_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,                -- Web Push endpoint URL
  p256dh text not null,                         -- encryption key
  auth text not null,                           -- auth secret
  user_agent text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index idx_push_subs_user on public.push_subscriptions(user_id) where is_active = true;

comment on table public.push_subscriptions is 'Web Push (VAPID) subscriptions for proactive AI messages.';

-- ── 9. proactive_message_templates ──────────────────────────
-- Pre-written templates for push notifications (cost optimization)
create table public.proactive_message_templates (
  id uuid primary key default uuid_generate_v4(),
  character_id uuid not null references public.characters(id) on delete cascade,
  category text not null check (category in ('comeback', 'morning', 'evening', 'miss_you', 'random')),
  content text not null,                        -- template text
  selfie_id uuid references public.selfie_pool(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_proactive_templates_char on public.proactive_message_templates(character_id, category)
  where is_active = true;

comment on table public.proactive_message_templates is 'Pre-written push notification templates. Avoids LLM call for proactive messages.';

-- ── 10. preregistrations (EXISTING - keep as-is) ────────────
-- Already exists in production. No changes needed.
-- If not yet created, uncomment below:
/*
create table if not exists public.preregistrations (
  id uuid primary key default uuid_generate_v4(),
  email text not null unique,
  willing_to_pay boolean not null default false,
  source text,
  theme_preference text,
  created_at timestamptz not null default now()
);
*/

-- ============================================================
-- Functions
-- ============================================================

-- ── Consume credits atomically ──────────────────────────────
create or replace function public.consume_credits(
  p_user_id uuid,
  p_amount integer,
  p_tx_type credit_tx_type,
  p_description text default null
)
returns table(success boolean, new_balance integer, tx_id uuid)
language plpgsql
security definer
as $$
declare
  v_current_balance integer;
  v_new_balance integer;
  v_tx_id uuid;
begin
  -- Lock user row to prevent race conditions
  select credit_balance into v_current_balance
  from public.profiles
  where id = p_user_id
  for update;

  if v_current_balance is null then
    return query select false, 0, null::uuid;
    return;
  end if;

  if v_current_balance < p_amount then
    return query select false, v_current_balance, null::uuid;
    return;
  end if;

  v_new_balance := v_current_balance - p_amount;

  -- Update balance
  update public.profiles
  set credit_balance = v_new_balance, updated_at = now()
  where id = p_user_id;

  -- Record transaction
  insert into public.credit_transactions (user_id, tx_type, amount, balance_after, description)
  values (p_user_id, p_tx_type, -p_amount, v_new_balance, p_description)
  returning id into v_tx_id;

  return query select true, v_new_balance, v_tx_id;
end;
$$;

-- ── Add credits (purchase/bonus) ────────────────────────────
create or replace function public.add_credits(
  p_user_id uuid,
  p_amount integer,
  p_tx_type credit_tx_type,
  p_description text default null,
  p_provider_order_id text default null,
  p_price_usd numeric default null
)
returns table(success boolean, new_balance integer, tx_id uuid)
language plpgsql
security definer
as $$
declare
  v_new_balance integer;
  v_tx_id uuid;
begin
  -- Lock and update balance
  update public.profiles
  set credit_balance = credit_balance + p_amount, updated_at = now()
  where id = p_user_id
  returning credit_balance into v_new_balance;

  if v_new_balance is null then
    return query select false, 0, null::uuid;
    return;
  end if;

  -- Record transaction
  insert into public.credit_transactions
    (user_id, tx_type, amount, balance_after, description, provider_order_id, price_usd)
  values
    (p_user_id, p_tx_type, p_amount, v_new_balance, p_description, p_provider_order_id, p_price_usd)
  returning id into v_tx_id;

  return query select true, v_new_balance, v_tx_id;
end;
$$;

-- ── Increment conversation counters ─────────────────────────
create or replace function public.increment_conversation_stats(
  p_conversation_id uuid,
  p_is_selfie boolean default false
)
returns void
language plpgsql
security definer
as $$
begin
  update public.conversations
  set
    message_count = message_count + 1,
    selfie_count = selfie_count + (case when p_is_selfie then 1 else 0 end),
    last_message_at = now(),
    updated_at = now()
  where id = p_conversation_id;
end;
$$;

-- ── Select random selfie by rarity ──────────────────────────
create or replace function public.pick_selfie(
  p_character_id uuid,
  p_user_id uuid,
  p_trigger selfie_trigger_type default 'random'
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_rarity selfie_rarity;
  v_roll float;
  v_selfie_id uuid;
begin
  -- Rarity roll (weighted random)
  v_roll := random();
  v_rarity := case
    when v_roll < 0.02 then 'legendary'
    when v_roll < 0.10 then 'epic'
    when v_roll < 0.25 then 'rare'
    when v_roll < 0.55 then 'uncommon'
    else 'common'
  end;

  -- Pick a selfie the user hasn't received yet (prefer unseen)
  select sp.id into v_selfie_id
  from public.selfie_pool sp
  left join public.user_selfie_collection usc
    on usc.selfie_id = sp.id and usc.user_id = p_user_id
  where sp.character_id = p_character_id
    and sp.rarity = v_rarity
    and sp.is_active = true
    and p_trigger = any(sp.trigger_contexts)
    and usc.id is null  -- not yet collected
  order by random()
  limit 1;

  -- Fallback: if no unseen selfie at that rarity, try any rarity
  if v_selfie_id is null then
    select sp.id into v_selfie_id
    from public.selfie_pool sp
    where sp.character_id = p_character_id
      and sp.is_active = true
    order by random()
    limit 1;
  end if;

  return v_selfie_id;
end;
$$;

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.profiles enable row level security;
alter table public.characters enable row level security;
alter table public.selfie_pool enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.user_selfie_collection enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.proactive_message_templates enable row level security;

-- Profiles: users can read/update their own
create policy "Users can view own profile"
  on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id)
  with check (auth.uid() = id);

-- Characters: everyone can read active characters
create policy "Anyone can view active characters"
  on public.characters for select using (is_active = true);

-- Selfie pool: read via service role only (not directly exposed)
-- No public select policy -> accessed through functions

-- Conversations: users can CRUD their own
create policy "Users can view own conversations"
  on public.conversations for select using (auth.uid() = user_id);
create policy "Users can create conversations"
  on public.conversations for insert with check (auth.uid() = user_id);
create policy "Users can update own conversations"
  on public.conversations for update using (auth.uid() = user_id);

-- Messages: users can read messages in their conversations
create policy "Users can view messages in own conversations"
  on public.messages for select using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  );
create policy "Users can insert messages in own conversations"
  on public.messages for insert with check (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  );

-- User selfie collection: users can read their own
create policy "Users can view own collection"
  on public.user_selfie_collection for select using (auth.uid() = user_id);
create policy "Users can update favorites"
  on public.user_selfie_collection for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Credit transactions: users can read their own
create policy "Users can view own transactions"
  on public.credit_transactions for select using (auth.uid() = user_id);

-- Push subscriptions: users can manage their own
create policy "Users can view own push subs"
  on public.push_subscriptions for select using (auth.uid() = user_id);
create policy "Users can insert push subs"
  on public.push_subscriptions for insert with check (auth.uid() = user_id);
create policy "Users can update own push subs"
  on public.push_subscriptions for update using (auth.uid() = user_id);
create policy "Users can delete own push subs"
  on public.push_subscriptions for delete using (auth.uid() = user_id);

-- Proactive templates: read via service role only
-- No public policy needed

-- ============================================================
-- Enable Realtime for messages table
-- ============================================================
alter publication supabase_realtime add table public.messages;

-- ============================================================
-- Updated_at trigger helper
-- ============================================================
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at before update on public.profiles
  for each row execute function public.update_updated_at();
create trigger set_updated_at before update on public.conversations
  for each row execute function public.update_updated_at();
