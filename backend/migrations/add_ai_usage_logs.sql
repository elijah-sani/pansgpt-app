-- AI Usage Analytics: track every LLM request across all users and universities.
-- Run this in the Supabase SQL Editor.

create table if not exists public.ai_usage_logs (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid null references auth.users(id) on delete set null,
  university_id     uuid null references public.universities(id) on delete set null,
  session_id        text null,
  request_type      text not null,        -- 'chat' | 'quiz' | 'vision' | 'title_gen' | 'other'
  model_used        text not null,
  provider          text not null,        -- 'groq' | 'google' | 'openrouter'
  prompt_tokens     integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens      integer not null default 0,
  latency_ms        double precision null,
  status            text not null default 'success'
                      check (status in ('success', 'error', 'timeout', 'failover')),
  failover_count    integer not null default 0,
  has_images        boolean not null default false,
  created_at        timestamptz not null default timezone('utc'::text, now())
);

-- Index for time-series queries (most common access pattern)
create index if not exists ai_usage_logs_created_at_idx
  on public.ai_usage_logs (created_at desc);

-- Index for per-university filtering
create index if not exists ai_usage_logs_university_id_idx
  on public.ai_usage_logs (university_id);

-- Index for per-user lookups
create index if not exists ai_usage_logs_user_id_idx
  on public.ai_usage_logs (user_id);

-- Index for model breakdown queries
create index if not exists ai_usage_logs_model_idx
  on public.ai_usage_logs (model_used);

-- Enable RLS
alter table public.ai_usage_logs enable row level security;

-- Clean up any previously created policies
drop policy if exists "ai_usage_logs_service_role_insert" on public.ai_usage_logs;
drop policy if exists "ai_usage_logs_super_admin_select" on public.ai_usage_logs;

-- Backend (service_role) can insert usage events
create policy "ai_usage_logs_service_role_insert"
on public.ai_usage_logs for insert
to service_role
with check (true);

-- Only super admins can read usage data
create policy "ai_usage_logs_super_admin_select"
on public.ai_usage_logs for select
to authenticated
using (public.is_super_admin());
