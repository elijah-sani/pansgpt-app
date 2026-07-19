-- Migration: Add document sections table and sections_status columns
-- [SECTION OUTLINE]

-- Add tracking columns to pans_library
alter table public.pans_library
add column if not exists sections_status text not null default 'pending' check (sections_status in ('pending', 'processing', 'completed', 'failed')),
add column if not exists sections_error text;

-- Create document_sections table
create table if not exists public.document_sections (
  id bigserial primary key,
  document_id uuid not null references public.pans_library(id) on delete cascade,
  section_index integer not null,
  title text not null,
  page_start integer not null,
  page_end integer not null,
  summary text not null,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

-- Index for document_id
create index if not exists document_sections_document_id_idx on public.document_sections(document_id);

-- Enable RLS
alter table public.document_sections enable row level security;

-- Select policy: Allow authenticated users to view sections if they match target_levels and university scoping
drop policy if exists "document_sections_select_policy" on public.document_sections;
create policy "document_sections_select_policy"
on public.document_sections for select
to authenticated
using (
  exists (
    select 1 from public.pans_library pl
    join public.profiles p on p.id = auth.uid()
    where pl.id = document_sections.document_id
      and (
        public.is_super_admin()
        or (
          pl.university_id = p.university_id
          and (
            pl.target_levels = '{}'
            or p.level = any(pl.target_levels)
          )
        )
      )
  )
);

-- Service role policy: Allow backend full control
drop policy if exists "document_sections_service_role_policy" on public.document_sections;
create policy "document_sections_service_role_policy"
on public.document_sections for all
to service_role
using (true)
with check (true);
