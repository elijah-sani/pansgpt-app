create table if not exists public.academic_contexts (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  current_academic_session text not null,
  current_semester text not null check (current_semester in ('first', 'second')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id) on delete set null,
  constraint academic_contexts_university_id_key unique (university_id)
);

create index if not exists academic_contexts_university_id_idx
on public.academic_contexts (university_id);
