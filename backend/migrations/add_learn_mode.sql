-- Learn Mode Migration: Phase 2
-- Adds lazy-generated content columns to document_sections and a per-user
-- progress tracking table for the Learn Mode guided study feature.
--
-- explanation and check_questions are NULL at ingestion time and populated
-- on first student visit to a section, so documents no one opens in Learn Mode
-- never incur extra LLM cost.
--
-- document_learn_progress RLS pattern matches document_notes exactly:
--   user_id = auth.uid() OR public.is_super_admin()   (select/insert/update/delete)
--   service_role: full access via catch-all policy

-- ─────────────────────────────────────────────────────────────
-- 1. Add lazy-generated columns to document_sections
-- ─────────────────────────────────────────────────────────────

alter table public.document_sections
  add column if not exists explanation text,        -- [LEARN MODE] plain-language section explanation generated on first visit
  add column if not exists check_questions jsonb;   -- [LEARN MODE] [{question_text, options, correct_answer, explanation}] 2-3 MCQ per section

comment on column public.document_sections.explanation is
  'Plain-language explanation of this section, generated lazily by TEXT_SECONDARY on first student visit.';

comment on column public.document_sections.check_questions is
  'Array of MCQ check questions in {question_text, options, correct_answer, explanation} shape (same as quiz_questions). Generated lazily; 2-3 per section.';

-- ─────────────────────────────────────────────────────────────
-- 2. Create document_learn_progress table
-- ─────────────────────────────────────────────────────────────

create table if not exists public.document_learn_progress (
  id uuid default gen_random_uuid() primary key,                                         -- [LEARN MODE]
  user_id uuid not null references auth.users(id) on delete cascade,                     -- [LEARN MODE]
  document_id uuid not null references public.pans_library(id) on delete cascade,        -- [LEARN MODE]
  section_index integer not null,                                                         -- [LEARN MODE]
  status text not null default 'not_started'                                              -- [LEARN MODE]
    check (status in ('not_started', 'in_progress', 'needs_review', 'mastered')),
  last_score integer,                                                                     -- [LEARN MODE] nullable; set on complete
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),      -- [LEARN MODE]
  constraint document_learn_progress_user_doc_section_unique                             -- [LEARN MODE]
    unique (user_id, document_id, section_index)
);

comment on table public.document_learn_progress is
  'Per-user, per-section Learn Mode progress. Private to each student. RLS mirrors document_notes.';

comment on column public.document_learn_progress.status is
  'not_started | in_progress | needs_review | mastered';

-- Trigger to keep updated_at current
drop trigger if exists set_document_learn_progress_updated_at on public.document_learn_progress;
create trigger set_document_learn_progress_updated_at
before update on public.document_learn_progress
for each row execute function public.set_updated_at();

-- Indexes
create index if not exists document_learn_progress_user_document_idx   -- [LEARN MODE]
  on public.document_learn_progress (user_id, document_id);

create index if not exists document_learn_progress_document_idx         -- [LEARN MODE]
  on public.document_learn_progress (document_id);

-- ─────────────────────────────────────────────────────────────
-- 3. RLS for document_learn_progress
--    Pattern: identical to document_notes (schema.sql lines 861-892)
--    user_id = auth.uid() OR public.is_super_admin()
-- ─────────────────────────────────────────────────────────────

alter table public.document_learn_progress enable row level security;

drop policy if exists "document_learn_progress_select_policy" on public.document_learn_progress;
drop policy if exists "document_learn_progress_insert_policy" on public.document_learn_progress;
drop policy if exists "document_learn_progress_update_policy" on public.document_learn_progress;
drop policy if exists "document_learn_progress_delete_policy" on public.document_learn_progress;
drop policy if exists "document_learn_progress_service_role_policy" on public.document_learn_progress;

-- Students see only their own rows; super_admins see all
create policy "document_learn_progress_select_policy"                   -- [LEARN MODE]
on public.document_learn_progress for select
to authenticated
using (user_id = auth.uid() or public.is_super_admin());

create policy "document_learn_progress_insert_policy"                   -- [LEARN MODE]
on public.document_learn_progress for insert
to authenticated
with check (user_id = auth.uid() or public.is_super_admin());

create policy "document_learn_progress_update_policy"                   -- [LEARN MODE]
on public.document_learn_progress for update
to authenticated
using (user_id = auth.uid() or public.is_super_admin())
with check (user_id = auth.uid() or public.is_super_admin());

create policy "document_learn_progress_delete_policy"                   -- [LEARN MODE]
on public.document_learn_progress for delete
to authenticated
using (user_id = auth.uid() or public.is_super_admin());

-- Backend service role bypass (same as all other tables)
create policy "document_learn_progress_service_role_policy"             -- [LEARN MODE]
on public.document_learn_progress for all
to service_role
using (true)
with check (true);
