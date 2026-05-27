-- ============================================================
-- Stage 2 Data Structure Prep
-- 1. user_gender on profiles
-- 2. Conversation statistics view
-- ============================================================

-- ── user_gender on profiles ─────────────────────────────────
alter table public.profiles
  add column if not exists user_gender text
    check (user_gender in ('male', 'female', 'other', null));

comment on column public.profiles.user_gender is 'User gender for Stage 2 analytics. Set during onboarding or profile edit.';

-- ── Conversation statistics view ────────────────────────────
create or replace view public.conversation_stats as
select
  c.id as conversation_id,
  c.user_id,
  c.character_id,
  c.message_count,
  c.selfie_count,
  c.ai_engagement_level,
  c.created_at as conversation_started_at,
  c.last_message_at,
  coalesce(stats.avg_user_msg_length, 0) as avg_user_msg_length,
  coalesce(stats.avg_ai_msg_length, 0) as avg_ai_msg_length,
  coalesce(stats.total_user_messages, 0) as total_user_messages,
  coalesce(stats.total_ai_messages, 0) as total_ai_messages,
  coalesce(stats.user_emoji_count, 0) as user_emoji_count,
  coalesce(rt.avg_response_gap_minutes, 0) as avg_response_gap_minutes,
  coalesce(mem.memory_count, 0) as memory_count
from public.conversations c
left join lateral (
  select
    avg(case when m.role = 'user' then length(m.content) end)::integer as avg_user_msg_length,
    avg(case when m.role = 'assistant' then length(m.content) end)::integer as avg_ai_msg_length,
    count(case when m.role = 'user' then 1 end) as total_user_messages,
    count(case when m.role = 'assistant' then 1 end) as total_ai_messages,
    sum(case when m.role = 'user' then
      array_length(
        regexp_split_to_array(
          m.content,
          '[^\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF\U0001F1E0-\U0001F1FF\U00002702-\U000027B0\U000024C2-\U0001F251]+'
        ), 1
      ) - 1
    else 0 end) as user_emoji_count
  from public.messages m
  where m.conversation_id = c.id
) stats on true
left join lateral (
  select
    avg(gap_minutes)::numeric(10,1) as avg_response_gap_minutes
  from (
    select
      extract(epoch from (lead(m.created_at) over (order by m.created_at) - m.created_at)) / 60.0 as gap_minutes
    from public.messages m
    where m.conversation_id = c.id and m.role = 'user'
  ) gaps
  where gap_minutes is not null and gap_minutes < 1440
) rt on true
left join lateral (
  select count(*) as memory_count
  from public.user_memory um
  where um.user_id = c.user_id
    and um.character_id = c.character_id
    and um.is_active = true
) mem on true
where c.is_active = true;
