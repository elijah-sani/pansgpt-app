-- [LEARN MODE TIERS] Migration: Confidence tier session tracking + tiered content caching
-- Adds:
--   1. document_learn_sessions table (per-user confidence tier selection)
--   2. tiered_content jsonb column on document_sections (per-tier cached content)
--   3. merge_section_tiered_content() SQL function (atomic jsonb merge, race-safe)

-- ─────────────────────────────────────────────────────────────
-- 1. Create document_learn_sessions table
-- ─────────────────────────────────────────────────────────────

create table if not exists public.document_learn_sessions (               -- [LEARN MODE TIERS]
  id uuid primary key default gen_random_uuid(),                           -- [LEARN MODE TIERS]
  user_id uuid not null references auth.users(id) on delete cascade,       -- [LEARN MODE TIERS]
  document_id uuid not null,                                               -- [LEARN MODE TIERS]
  confidence_level text not null                                           -- [LEARN MODE TIERS]
    check (confidence_level in ('new', 'familiar', 'confident')),          -- [LEARN MODE TIERS]
  created_at timestamptz not null default now(),                           -- [LEARN MODE TIERS]
  updated_at timestamptz not null default now(),                           -- [LEARN MODE TIERS]
  constraint document_learn_sessions_user_doc_unique                       -- [LEARN MODE TIERS]
    unique (user_id, document_id)                                          -- [LEARN MODE TIERS]
);                                                                         -- [LEARN MODE TIERS]

comment on table public.document_learn_sessions is
  'Stores the most recent confidence tier a student selected when starting Learn Mode for a document. One row per (user, document); upserted on each /start call.';  -- [LEARN MODE TIERS]

comment on column public.document_learn_sessions.confidence_level is
  'new | familiar | confident — matches the familiarity check options shown in the UI.';  -- [LEARN MODE TIERS]

-- Trigger to keep updated_at current
drop trigger if exists set_document_learn_sessions_updated_at on public.document_learn_sessions;  -- [LEARN MODE TIERS]
create trigger set_document_learn_sessions_updated_at                      -- [LEARN MODE TIERS]
before update on public.document_learn_sessions                            -- [LEARN MODE TIERS]
for each row execute function public.set_updated_at();                     -- [LEARN MODE TIERS]

-- Indexes
create index if not exists document_learn_sessions_user_doc_idx            -- [LEARN MODE TIERS]
  on public.document_learn_sessions (user_id, document_id);               -- [LEARN MODE TIERS]

-- ─────────────────────────────────────────────────────────────
-- 2. RLS for document_learn_sessions
--    Pattern: mirrors document_learn_progress exactly
--    (add_learn_mode.sql lines 69-104)
-- ─────────────────────────────────────────────────────────────

alter table public.document_learn_sessions enable row level security;     -- [LEARN MODE TIERS]

drop policy if exists "document_learn_sessions_select_policy" on public.document_learn_sessions;  -- [LEARN MODE TIERS]
drop policy if exists "document_learn_sessions_insert_policy" on public.document_learn_sessions;  -- [LEARN MODE TIERS]
drop policy if exists "document_learn_sessions_update_policy" on public.document_learn_sessions;  -- [LEARN MODE TIERS]
drop policy if exists "document_learn_sessions_delete_policy" on public.document_learn_sessions;  -- [LEARN MODE TIERS]
drop policy if exists "document_learn_sessions_service_role_policy" on public.document_learn_sessions;  -- [LEARN MODE TIERS]

-- Students see only their own rows; super_admins see all
create policy "document_learn_sessions_select_policy"                      -- [LEARN MODE TIERS]
on public.document_learn_sessions for select
to authenticated
using (user_id = auth.uid() or public.is_super_admin());                   -- [LEARN MODE TIERS]

create policy "document_learn_sessions_insert_policy"                      -- [LEARN MODE TIERS]
on public.document_learn_sessions for insert
to authenticated
with check (user_id = auth.uid() or public.is_super_admin());              -- [LEARN MODE TIERS]

create policy "document_learn_sessions_update_policy"                      -- [LEARN MODE TIERS]
on public.document_learn_sessions for update
to authenticated
using (user_id = auth.uid() or public.is_super_admin())                    -- [LEARN MODE TIERS]
with check (user_id = auth.uid() or public.is_super_admin());              -- [LEARN MODE TIERS]

create policy "document_learn_sessions_delete_policy"                      -- [LEARN MODE TIERS]
on public.document_learn_sessions for delete
to authenticated
using (user_id = auth.uid() or public.is_super_admin());                   -- [LEARN MODE TIERS]

-- Backend service role bypass
create policy "document_learn_sessions_service_role_policy"                -- [LEARN MODE TIERS]
on public.document_learn_sessions for all
to service_role
using (true)
with check (true);                                                         -- [LEARN MODE TIERS]

-- ─────────────────────────────────────────────────────────────
-- 3. Add tiered_content column to document_sections
--    The existing explanation and check_questions columns are
--    left untouched for rollback safety — they simply go unused
--    going forward as content is now stored in tiered_content.
-- ─────────────────────────────────────────────────────────────

alter table public.document_sections                                       -- [LEARN MODE TIERS]
  add column if not exists tiered_content jsonb not null default '{}'::jsonb;  -- [LEARN MODE TIERS]

comment on column public.document_sections.tiered_content is
  'Per-tier cached LLM content. Keys: "new", "familiar", "confident". Each value: {explanation: text, check_questions: [{question_text, options, correct_answer, explanation}]}. Populated lazily on first visit per tier; merged atomically via merge_section_tiered_content().';  -- [LEARN MODE TIERS]

-- ─────────────────────────────────────────────────────────────
-- 4. merge_section_tiered_content() — atomic jsonb merge function
--    Uses the || operator (jsonb concatenation) inside a single
--    UPDATE statement. Postgres serialises concurrent UPDATEs on
--    the same row, so two students generating different tiers
--    concurrently will never clobber each other's content.
--
--    Security:
--      - Plain LANGUAGE sql (no SECURITY DEFINER needed; the
--        service-role client bypasses RLS already)
--      - REVOKE from PUBLIC, GRANT only to service_role
--        (same discipline as the project's established pattern)
-- ─────────────────────────────────────────────────────────────

create or replace function public.merge_section_tiered_content(            -- [LEARN MODE TIERS]
  p_section_id uuid,                                                       -- [LEARN MODE TIERS]
  p_patch jsonb                                                            -- [LEARN MODE TIERS]
)
returns jsonb                                                              -- [LEARN MODE TIERS]
language sql                                                               -- [LEARN MODE TIERS]
as $$                                                                      -- [LEARN MODE TIERS]
  update public.document_sections                                          -- [LEARN MODE TIERS]
  set tiered_content = tiered_content || p_patch                          -- [LEARN MODE TIERS]
  where id = p_section_id                                                  -- [LEARN MODE TIERS]
  returning tiered_content;                                                -- [LEARN MODE TIERS]
$$;                                                                        -- [LEARN MODE TIERS]

revoke all on function public.merge_section_tiered_content(uuid, jsonb) from public;  -- [LEARN MODE TIERS]
grant execute on function public.merge_section_tiered_content(uuid, jsonb) to service_role;  -- [LEARN MODE TIERS]
