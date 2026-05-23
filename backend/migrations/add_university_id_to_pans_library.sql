alter table public.pans_library
add column if not exists university_id uuid references public.universities(id) on delete set null;

create index if not exists pans_library_university_id_idx
on public.pans_library (university_id);
