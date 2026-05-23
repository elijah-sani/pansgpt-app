-- FILE: backend/migrations/add_lecturer_portal_foundation.sql
BEGIN;

create table if not exists public.universities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text,
  country text not null default 'Nigeria',
  state text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create unique index if not exists universities_name_lower_uidx
on public.universities (lower(name));

create index if not exists universities_status_idx
on public.universities (status);

drop trigger if exists set_universities_updated_at on public.universities;
create trigger set_universities_updated_at
before update on public.universities
for each row execute function public.set_updated_at();

alter table public.universities enable row level security;

drop policy if exists "universities_select_policy" on public.universities;
drop policy if exists "universities_super_admin_policy" on public.universities;
drop policy if exists "universities_service_role_policy" on public.universities;

create policy "universities_select_policy"
on public.universities for select
to authenticated
using (true);

create policy "universities_super_admin_policy"
on public.universities for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "universities_service_role_policy"
on public.universities for all
to service_role
using (true)
with check (true);

create table if not exists public.lecturer_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  university_id uuid not null references public.universities(id) on delete restrict,
  title text,
  full_name text not null,
  email text not null,
  phone_number text,
  status text not null default 'pending' check (status in ('pending', 'active', 'rejected', 'suspended', 'revoked')),
  rejection_reason text,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create unique index if not exists lecturer_profiles_user_id_uidx
on public.lecturer_profiles (user_id);

create unique index if not exists lecturer_profiles_id_university_uidx
on public.lecturer_profiles (id, university_id);

create unique index if not exists lecturer_profiles_university_email_uidx
on public.lecturer_profiles (university_id, lower(email));

create index if not exists lecturer_profiles_user_id_idx
on public.lecturer_profiles (user_id);

create index if not exists lecturer_profiles_university_status_idx
on public.lecturer_profiles (university_id, status);

drop trigger if exists set_lecturer_profiles_updated_at on public.lecturer_profiles;
create trigger set_lecturer_profiles_updated_at
before update on public.lecturer_profiles
for each row execute function public.set_updated_at();

alter table public.lecturer_profiles enable row level security;

drop policy if exists "lecturer_profiles_select_policy" on public.lecturer_profiles;
drop policy if exists "lecturer_profiles_insert_policy" on public.lecturer_profiles;
drop policy if exists "lecturer_profiles_super_admin_policy" on public.lecturer_profiles;
drop policy if exists "lecturer_profiles_service_role_policy" on public.lecturer_profiles;

create policy "lecturer_profiles_select_policy"
on public.lecturer_profiles for select
to authenticated
using (user_id = auth.uid() or public.is_super_admin());

create policy "lecturer_profiles_insert_policy"
on public.lecturer_profiles for insert
to authenticated
with check (
  public.is_super_admin()
  or (
    user_id = auth.uid()
    and status = 'pending'
    and approved_by is null
    and approved_at is null
    and rejection_reason is null
  )
);

create policy "lecturer_profiles_super_admin_policy"
on public.lecturer_profiles for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "lecturer_profiles_service_role_policy"
on public.lecturer_profiles for all
to service_role
using (true)
with check (true);

create table if not exists public.exam_restrictions (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete restrict,
  lecturer_id uuid not null references public.lecturer_profiles(id) on delete restrict,
  title text not null,
  course_code text,
  course_title text,
  level text not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  reason text,
  status text not null default 'scheduled' check (status in ('scheduled', 'active', 'completed', 'cancelled')),
  cancelled_by uuid references auth.users(id) on delete set null,
  cancelled_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint exam_restrictions_time_check check (end_time > start_time),
  constraint exam_restrictions_lecturer_university_fk
    foreign key (lecturer_id, university_id)
    references public.lecturer_profiles (id, university_id)
    on delete restrict
);

create index if not exists exam_restrictions_university_level_window_idx
on public.exam_restrictions (university_id, level, start_time, end_time);

create index if not exists exam_restrictions_status_idx
on public.exam_restrictions (status);

drop trigger if exists set_exam_restrictions_updated_at on public.exam_restrictions;
create trigger set_exam_restrictions_updated_at
before update on public.exam_restrictions
for each row execute function public.set_updated_at();

alter table public.exam_restrictions enable row level security;

drop policy if exists "exam_restrictions_super_admin_policy" on public.exam_restrictions;
drop policy if exists "exam_restrictions_service_role_policy" on public.exam_restrictions;

create policy "exam_restrictions_super_admin_policy"
on public.exam_restrictions for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "exam_restrictions_service_role_policy"
on public.exam_restrictions for all
to service_role
using (true)
with check (true);

create table if not exists public.lecturer_material_submissions (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete restrict,
  lecturer_id uuid not null references public.lecturer_profiles(id) on delete restrict,
  course_code text,
  course_title text,
  level text,
  material_type text,
  title text not null,
  description text,
  file_name text,
  file_url text,
  storage_provider text,
  status text not null default 'pending_review' check (status in ('pending_review', 'approved', 'rejected', 'ingesting', 'ingested', 'failed')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  pans_library_id uuid references public.pans_library(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint lecturer_material_submissions_lecturer_university_fk
    foreign key (lecturer_id, university_id)
    references public.lecturer_profiles (id, university_id)
    on delete restrict
);

create index if not exists lecturer_material_submissions_university_status_idx
on public.lecturer_material_submissions (university_id, status);

create index if not exists lecturer_material_submissions_lecturer_status_idx
on public.lecturer_material_submissions (lecturer_id, status);

drop trigger if exists set_lecturer_material_submissions_updated_at on public.lecturer_material_submissions;
create trigger set_lecturer_material_submissions_updated_at
before update on public.lecturer_material_submissions
for each row execute function public.set_updated_at();

alter table public.lecturer_material_submissions enable row level security;

drop policy if exists "lecturer_material_submissions_super_admin_policy" on public.lecturer_material_submissions;
drop policy if exists "lecturer_material_submissions_service_role_policy" on public.lecturer_material_submissions;

create policy "lecturer_material_submissions_super_admin_policy"
on public.lecturer_material_submissions for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "lecturer_material_submissions_service_role_policy"
on public.lecturer_material_submissions for all
to service_role
using (true)
with check (true);

create table if not exists public.access_control_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text,
  university_id uuid references public.universities(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists access_control_audit_logs_actor_created_idx
on public.access_control_audit_logs (actor_user_id, created_at desc);

create index if not exists access_control_audit_logs_university_created_idx
on public.access_control_audit_logs (university_id, created_at desc);

alter table public.access_control_audit_logs enable row level security;

drop policy if exists "access_control_audit_logs_super_admin_policy" on public.access_control_audit_logs;
drop policy if exists "access_control_audit_logs_service_role_policy" on public.access_control_audit_logs;

create policy "access_control_audit_logs_super_admin_policy"
on public.access_control_audit_logs for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "access_control_audit_logs_service_role_policy"
on public.access_control_audit_logs for all
to service_role
using (true)
with check (true);

COMMIT;
