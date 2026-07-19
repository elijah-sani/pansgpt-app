-- [LEARN RETEST] Migration for Deferred Retests Feature
-- [LEARN RETEST]

create table if not exists public.document_learn_pending_retests (
  id bigserial primary key,                                                                     -- [LEARN RETEST]
  user_id uuid not null references auth.users(id) on delete cascade,                            -- [LEARN RETEST]
  document_id uuid not null references public.pans_library(id) on delete cascade,               -- [LEARN RETEST]
  origin_section_index integer not null,                                                        -- [LEARN RETEST]
  target_section_index integer not null,                                                        -- [LEARN RETEST]
  question jsonb not null,                                                                      -- [LEARN RETEST]
  resolved boolean not null default false,                                                      -- [LEARN RETEST]
  resolved_correct boolean,                                                                     -- [LEARN RETEST]
  created_at timestamp with time zone not null default timezone('utc'::text, now()),            -- [LEARN RETEST]
  resolved_at timestamp with time zone                                                          -- [LEARN RETEST]
);                                                                                              -- [LEARN RETEST]

-- [LEARN RETEST] Enable RLS
alter table public.document_learn_pending_retests enable row level security;                     -- [LEARN RETEST]

-- [LEARN RETEST] Replicate exact document_learn_progress RLS policy patterns
drop policy if exists "document_learn_pending_retests_select_policy" on public.document_learn_pending_retests;  -- [LEARN RETEST]
drop policy if exists "document_learn_pending_retests_insert_policy" on public.document_learn_pending_retests;  -- [LEARN RETEST]
drop policy if exists "document_learn_pending_retests_update_policy" on public.document_learn_pending_retests;  -- [LEARN RETEST]
drop policy if exists "document_learn_pending_retests_delete_policy" on public.document_learn_pending_retests;  -- [LEARN RETEST]
drop policy if exists "document_learn_pending_retests_service_role_policy" on public.document_learn_pending_retests; -- [LEARN RETEST]

create policy "document_learn_pending_retests_select_policy"                                    -- [LEARN RETEST]
on public.document_learn_pending_retests for select                                             -- [LEARN RETEST]
to authenticated                                                                                -- [LEARN RETEST]
using (user_id = auth.uid() or public.is_super_admin());                                         -- [LEARN RETEST]

create policy "document_learn_pending_retests_insert_policy"                                    -- [LEARN RETEST]
on public.document_learn_pending_retests for insert                                             -- [LEARN RETEST]
to authenticated                                                                                -- [LEARN RETEST]
with check (user_id = auth.uid() or public.is_super_admin());                                    -- [LEARN RETEST]

create policy "document_learn_pending_retests_update_policy"                                    -- [LEARN RETEST]
on public.document_learn_pending_retests for update                                             -- [LEARN RETEST]
to authenticated                                                                                -- [LEARN RETEST]
using (user_id = auth.uid() or public.is_super_admin())                                         -- [LEARN RETEST]
with check (user_id = auth.uid() or public.is_super_admin());                                    -- [LEARN RETEST]

create policy "document_learn_pending_retests_delete_policy"                                    -- [LEARN RETEST]
on public.document_learn_pending_retests for delete                                             -- [LEARN RETEST]
to authenticated                                                                                -- [LEARN RETEST]
using (user_id = auth.uid() or public.is_super_admin());                                         -- [LEARN RETEST]

create policy "document_learn_pending_retests_service_role_policy"                              -- [LEARN RETEST]
on public.document_learn_pending_retests for all                                                 -- [LEARN RETEST]
to service_role                                                                                 -- [LEARN RETEST]
using (true)                                                                                    -- [LEARN RETEST]
with check (true);                                                                              -- [LEARN RETEST]

-- [LEARN RETEST] Indexes
create index if not exists document_learn_pending_retests_user_doc_idx                          -- [LEARN RETEST]
  on public.document_learn_pending_retests (user_id, document_id, target_section_index);       -- [LEARN RETEST]
