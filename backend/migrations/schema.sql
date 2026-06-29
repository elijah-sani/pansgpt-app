-- Canonical PansGPT schema as of March 2026. Keep this file in sync with all schema changes.

create extension if not exists pgcrypto;
create extension if not exists vector;

set check_function_bodies = off;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and (
        ur.role in ('super_admin', 'global_admin')
        or (ur.role = 'admin' and ur.university_id is null)
      )
  );
$$;

revoke all on function public.is_super_admin() from public;
grant execute on function public.is_super_admin() to authenticated;

CREATE OR REPLACE FUNCTION public.claim_pending_admin_access(
  p_email text,
  p_user_id uuid
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  email text,
  role text,
  is_admin boolean,
  university_id uuid,
  admin_level text,
  created_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_row public.user_roles%rowtype;
BEGIN
  v_email := lower(trim(p_email));

  -- Lock the matching row
  SELECT * INTO v_row
  FROM public.user_roles
  WHERE lower(email) = v_email
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_row.user_id IS NULL THEN
    -- Bind the user_id
    UPDATE public.user_roles ur
    SET user_id = p_user_id
    WHERE ur.id = v_row.id
    RETURNING * INTO v_row;
    
    RETURN QUERY SELECT 
      v_row.id, v_row.user_id, v_row.email, v_row.role, 
      v_row.is_admin, v_row.university_id, v_row.admin_level, v_row.created_at;
  ELSIF v_row.user_id = p_user_id THEN
    -- Idempotent success
    RETURN QUERY SELECT 
      v_row.id, v_row.user_id, v_row.email, v_row.role, 
      v_row.is_admin, v_row.university_id, v_row.admin_level, v_row.created_at;
  ELSE
    -- Claimed by a different user
    RAISE EXCEPTION 'Unsafe overwrite blocked: email % already claimed by user %', v_email, v_row.user_id;
  END IF;
END;
$$;

revoke all on function public.claim_pending_admin_access(text, uuid) from public;
grant execute on function public.claim_pending_admin_access(text, uuid) to authenticated, service_role;


create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  other_names text,
  full_name text,
  avatar_url text,
  university text,
  level text,
  subscription_tier text not null default 'free' check (subscription_tier in ('free', 'pro')),
  has_seen_welcome boolean not null default false,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

create index if not exists profiles_level_idx on public.profiles(level);
create index if not exists profiles_subscription_tier_idx on public.profiles(subscription_tier);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_policy" on public.profiles;
drop policy if exists "profiles_insert_policy" on public.profiles;
drop policy if exists "profiles_update_policy" on public.profiles;

create policy "profiles_select_policy"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_super_admin());

create policy "profiles_insert_policy"
on public.profiles for insert
to authenticated
with check (id = auth.uid() or public.is_super_admin());

create policy "profiles_update_policy"
on public.profiles for update
to authenticated
using (id = auth.uid() or public.is_super_admin())
with check (id = auth.uid() or public.is_super_admin());

create table if not exists public.user_roles (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  email text unique not null,
  role text not null constraint user_roles_role_check check (role in ('super_admin', 'university_admin')),
  is_admin boolean default true,
  university_id uuid references public.universities(id) on delete restrict,
  admin_level text null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint user_roles_role_scope_check check (
    (
      role = 'super_admin'
      and university_id is null
      and admin_level is null
    )
    or
    (
      role = 'university_admin'
      and university_id is not null
      and admin_level in ('senior', 'standard')
    )
  )
);

create unique index if not exists user_roles_user_id_uidx
on public.user_roles (user_id)
where user_id is not null;

create index if not exists user_roles_university_id_idx
on public.user_roles (university_id);

create index if not exists user_roles_role_idx
on public.user_roles (role);

alter table public.user_roles enable row level security;

drop policy if exists "user_roles_select_policy" on public.user_roles;
drop policy if exists "user_roles_insert_policy" on public.user_roles;
drop policy if exists "user_roles_update_policy" on public.user_roles;
drop policy if exists "user_roles_delete_policy" on public.user_roles;

create policy "user_roles_select_policy"
on public.user_roles for select
to authenticated
using (user_id = auth.uid() or public.is_super_admin());

create policy "user_roles_insert_policy"
on public.user_roles for insert
to authenticated
with check (public.is_super_admin());

create policy "user_roles_update_policy"
on public.user_roles for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "user_roles_delete_policy"
on public.user_roles for delete
to authenticated
using (public.is_super_admin());

create table if not exists public.universities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text,
  country text not null default 'Nigeria',
  state text,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
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

create table if not exists public.academic_contexts (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete restrict,
  current_academic_session text not null,
  current_semester text not null check (current_semester in ('first', 'second')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id) on delete set null,
  constraint academic_contexts_university_id_key unique (university_id)
);

create index if not exists academic_contexts_university_id_idx
on public.academic_contexts (university_id);

drop trigger if exists set_academic_contexts_updated_at on public.academic_contexts;
create trigger set_academic_contexts_updated_at
before update on public.academic_contexts
for each row execute function public.set_updated_at();

alter table public.profiles
add column if not exists university_id uuid references public.universities(id) on delete restrict;

create index if not exists profiles_university_id_idx
on public.profiles(university_id);

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
  approved_at timestamp with time zone,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
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
  start_time timestamp with time zone not null,
  end_time timestamp with time zone not null,
  reason text,
  status text not null default 'scheduled' check (status in ('scheduled', 'active', 'completed', 'cancelled')),
  cancelled_by uuid references auth.users(id) on delete set null,
  cancelled_at timestamp with time zone,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
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
  file_type text,
  mime_type text,
  is_supported_file boolean not null default false,
  status text not null default 'pending_review' check (status in ('pending_review', 'approved', 'rejected', 'cancelled')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamp with time zone,
  review_note text,
  pans_library_id uuid references public.pans_library(id) on delete set null,
  cancelled_at timestamp with time zone,
  cancelled_by uuid references auth.users(id) on delete set null,
  cancellation_reason text,
  drive_file_id text,
  original_drive_file_id text,
  converted_drive_file_id text,
  resubmitted_from_id uuid references public.lecturer_material_submissions(id) on delete restrict,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint lecturer_material_submissions_lecturer_university_fk
    foreign key (lecturer_id, university_id)
    references public.lecturer_profiles (id, university_id)
    on delete restrict
);

create index if not exists lecturer_material_submissions_university_status_idx
on public.lecturer_material_submissions (university_id, status);

create index if not exists lecturer_material_submissions_lecturer_status_idx
on public.lecturer_material_submissions (lecturer_id, status);

create index if not exists lecturer_material_submissions_cancelled_at_idx
on public.lecturer_material_submissions (cancelled_at);

create index if not exists lecturer_material_submissions_drive_file_id_idx
on public.lecturer_material_submissions (drive_file_id);

create index if not exists lecturer_material_submissions_original_drive_file_id_idx
on public.lecturer_material_submissions (original_drive_file_id);

create index if not exists lecturer_material_submissions_converted_drive_file_id_idx
on public.lecturer_material_submissions (converted_drive_file_id);

create index if not exists lecturer_material_submissions_resubmitted_from_id_idx
on public.lecturer_material_submissions (resubmitted_from_id);

create unique index if not exists lecturer_material_submissions_one_resubmission_per_rejection_idx
on public.lecturer_material_submissions (resubmitted_from_id)
where resubmitted_from_id is not null;

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
  created_at timestamp with time zone not null default timezone('utc'::text, now())
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

create table if not exists public.system_settings (
  id integer primary key default 1,
  system_prompt text,
  temperature double precision not null default 0.7,
  maintenance_mode boolean not null default false,
  web_search_enabled boolean not null default true,
  rag_threshold double precision null default 0.50,
  total_api_calls bigint not null default 0,
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint check_temperature check (temperature >= 0.0 and temperature <= 1.0)
);

drop trigger if exists set_system_settings_updated_at on public.system_settings;
create trigger set_system_settings_updated_at
before update on public.system_settings
for each row execute function public.set_updated_at();

alter table public.system_settings enable row level security;

drop policy if exists "system_settings_select_policy" on public.system_settings;
drop policy if exists "system_settings_super_admin_policy" on public.system_settings;
drop policy if exists "system_settings_service_role_policy" on public.system_settings;

create policy "system_settings_select_policy"
on public.system_settings for select
to authenticated
using (true);

create policy "system_settings_super_admin_policy"
on public.system_settings for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "system_settings_service_role_policy"
on public.system_settings for all
to service_role
using (true)
with check (true);

insert into public.system_settings (id, system_prompt, temperature, maintenance_mode, web_search_enabled, total_api_calls)
values (1, 'You are PansGPT, an expert Pharmacy Tutor.', 0.7, false, true, 0)
on conflict (id) do nothing;

create table if not exists public.pans_library (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  course_code text not null,
  lecturer_name text not null,
  topic text not null,
  drive_file_id text not null unique,
  file_name text not null,
  file_size bigint not null default 0,
  university_id uuid references public.universities(id) on delete restrict,
  uploaded_by_email text,
  target_levels text[] not null default '{}',
  academic_session text,
  semester text,
  material_status text not null default 'active' check (material_status in ('active', 'archived')),
  visibility text default 'visible',
  source_type text default 'admin',
  approval_status text default 'approved',
  approved_by uuid,
  approved_at timestamp with time zone,
  archived_at timestamp with time zone,
  version_label text,
  replaces_document_id uuid references public.pans_library(id) on delete set null,
  embedding_status text not null default 'pending' check (embedding_status in ('pending', 'processing', 'completed', 'failed')),
  embedding_progress integer not null default 0 check (embedding_progress >= 0 and embedding_progress <= 100),
  total_chunks integer not null default 0 check (total_chunks >= 0),
  embedding_error text,
  failed_chunks_count integer not null default 0 check (failed_chunks_count >= 0),
  error_log text,
  ingestion_run_id uuid,
  ingestion_worker_id uuid,
  ingestion_worker_claimed_at timestamp with time zone,
  ingestion_worker_heartbeat_at timestamp with time zone,
  last_updated_at timestamp with time zone,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

create index if not exists pans_library_created_at_idx on public.pans_library(created_at desc);
create index if not exists pans_library_course_code_idx on public.pans_library(course_code);
create index if not exists pans_library_academic_session_idx on public.pans_library(academic_session);
create index if not exists pans_library_semester_idx on public.pans_library(semester);
create index if not exists pans_library_drive_file_id_idx on public.pans_library(drive_file_id);
create index if not exists pans_library_material_status_idx on public.pans_library(material_status);
create index if not exists pans_library_visibility_idx on public.pans_library(visibility);
create index if not exists pans_library_approval_status_idx on public.pans_library(approval_status);
create index if not exists pans_library_source_type_idx on public.pans_library(source_type);
create index if not exists pans_library_university_id_idx on public.pans_library(university_id);
create index if not exists pans_library_ingestion_run_id_idx on public.pans_library(ingestion_run_id);
create index if not exists pans_library_ingestion_worker_id_idx on public.pans_library(ingestion_worker_id);
create index if not exists idx_pans_library_target_levels on public.pans_library using gin (target_levels);

comment on column public.pans_library.target_levels is
  'Academic levels this document is visible to, e.g. {400lvl,500lvl}. Empty/null = visible to all.';

comment on column public.pans_library.material_status is
  'Authoritative material lifecycle: active = current/readable/AI-usable, archived = past/readable/not AI-used by default.';

comment on column public.pans_library.visibility is
  'Legacy non-authoritative column retained temporarily during material status simplification.';

comment on column public.pans_library.approval_status is
  'Legacy non-authoritative column retained temporarily; lecturer approval lives in lecturer_material_submissions.status.';

drop trigger if exists set_pans_library_updated_at on public.pans_library;
create trigger set_pans_library_updated_at
before update on public.pans_library
for each row execute function public.set_updated_at();

alter table public.pans_library enable row level security;

drop policy if exists "pans_library_select_policy" on public.pans_library;
drop policy if exists "pans_library_super_admin_policy" on public.pans_library;
drop policy if exists "pans_library_service_role_policy" on public.pans_library;

create policy "pans_library_select_policy"
on public.pans_library for select
to authenticated
using (true);

create policy "pans_library_super_admin_policy"
on public.pans_library for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "pans_library_service_role_policy"
on public.pans_library for all
to service_role
using (true)
with check (true);

create table if not exists public.document_embeddings (
  id bigserial primary key,
  document_id uuid not null references public.pans_library(id) on delete cascade,
  ingestion_run_id uuid,
  ingestion_worker_id uuid,
  content text not null,
  embedding vector(768) not null,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

create index if not exists document_embeddings_document_id_idx on public.document_embeddings(document_id);
create index if not exists document_embeddings_ingestion_run_id_idx on public.document_embeddings(ingestion_run_id);
create index if not exists document_embeddings_ingestion_worker_id_idx on public.document_embeddings(ingestion_worker_id);
create index if not exists document_embeddings_embedding_idx
on public.document_embeddings
using ivfflat (embedding vector_cosine_ops)
with (lists = 100);

create or replace function public.prevent_stale_document_embedding_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_run_id uuid;
  v_current_worker_id uuid;
  v_embedding_status text;
begin
  if new.ingestion_run_id is null then
    raise exception 'ingestion_run_id is required for document embedding writes';
  end if;
  if new.ingestion_worker_id is null then
    raise exception 'ingestion_worker_id is required for document embedding writes';
  end if;

  select pl.ingestion_run_id, pl.ingestion_worker_id, pl.embedding_status
  into v_current_run_id, v_current_worker_id, v_embedding_status
  from public.pans_library pl
  where pl.id = new.document_id;

  if not found then
    raise exception 'Document not found for embedding write';
  end if;

  if v_embedding_status <> 'processing'
     or v_current_run_id is distinct from new.ingestion_run_id
     or v_current_worker_id is distinct from new.ingestion_worker_id then
    raise exception 'Stale ingestion worker cannot write embeddings for this document';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_stale_document_embedding_write_trigger on public.document_embeddings;
create trigger prevent_stale_document_embedding_write_trigger
before insert or update on public.document_embeddings
for each row execute function public.prevent_stale_document_embedding_write();

alter table public.document_embeddings enable row level security;

drop policy if exists "document_embeddings_service_role_policy" on public.document_embeddings;
create policy "document_embeddings_service_role_policy"
on public.document_embeddings for all
to service_role
using (true)
with check (true);

create or replace function public.match_documents(
  query_embedding vector(768),
  match_threshold double precision,
  match_count integer,
  filter_doc_id uuid
)
returns table (
  id bigint,
  document_id uuid,
  content text,
  similarity double precision
)
language sql
security definer
set search_path = public
as $$
  -- Resolve semester/session defaults
  select
    de.id,
    de.document_id,
    de.content,
    1 - (de.embedding <=> query_embedding) as similarity
  from public.document_embeddings de
  where de.document_id = filter_doc_id
    and 1 - (de.embedding <=> query_embedding) >= match_threshold
  order by de.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

create or replace function public.match_documents_global(
  query_embedding vector(768),
  match_threshold double precision,
  match_count integer,
  allowed_doc_ids uuid[]
)
returns table (
  id bigint,
  document_id uuid,
  content text,
  similarity double precision
)
language sql
security definer
set search_path = public
as $$
  select
    de.id,
    de.document_id,
    de.content,
    1 - (de.embedding <=> query_embedding) as similarity
  from public.document_embeddings de
  where de.document_id = any(allowed_doc_ids)
    and 1 - (de.embedding <=> query_embedding) >= match_threshold
  order by de.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

revoke all on function public.match_documents(vector, double precision, integer, uuid) from public;
revoke all on function public.match_documents_global(vector, double precision, integer, uuid[]) from public;
grant execute on function public.match_documents(vector, double precision, integer, uuid) to authenticated, service_role;
grant execute on function public.match_documents_global(vector, double precision, integer, uuid[]) to authenticated, service_role;

create table if not exists public.document_notes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.pans_library(id) on delete cascade,
  image_base64 text not null default '',
  ai_explanation text,
  category text default 'Key Point' check (category in ('Definition', 'Key Point', 'Formula', 'Important')),
  page_number integer,
  user_annotation text,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

create index if not exists document_notes_user_document_idx on public.document_notes(user_id, document_id, created_at);
create index if not exists document_notes_document_idx on public.document_notes(document_id);

alter table public.document_notes enable row level security;

drop policy if exists "document_notes_select_policy" on public.document_notes;
drop policy if exists "document_notes_insert_policy" on public.document_notes;
drop policy if exists "document_notes_update_policy" on public.document_notes;
drop policy if exists "document_notes_delete_policy" on public.document_notes;
drop policy if exists "document_notes_service_role_policy" on public.document_notes;

create policy "document_notes_select_policy"
on public.document_notes for select
to authenticated
using (user_id = auth.uid() or public.is_super_admin());

create policy "document_notes_insert_policy"
on public.document_notes for insert
to authenticated
with check (user_id = auth.uid() or public.is_super_admin());

create policy "document_notes_update_policy"
on public.document_notes for update
to authenticated
using (user_id = auth.uid() or public.is_super_admin())
with check (user_id = auth.uid() or public.is_super_admin());

create policy "document_notes_delete_policy"
on public.document_notes for delete
to authenticated
using (user_id = auth.uid() or public.is_super_admin());

create policy "document_notes_service_role_policy"
on public.document_notes for all
to service_role
using (true)
with check (true);

create table if not exists public.chat_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New Chat',
  summary text,
  context_id text,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

create index if not exists chat_sessions_user_updated_idx on public.chat_sessions(user_id, updated_at desc);
create index if not exists chat_sessions_context_idx on public.chat_sessions(context_id);

drop trigger if exists set_chat_sessions_updated_at on public.chat_sessions;
create trigger set_chat_sessions_updated_at
before update on public.chat_sessions
for each row execute function public.set_updated_at();

alter table public.chat_sessions enable row level security;

drop policy if exists "chat_sessions_select_policy" on public.chat_sessions;
drop policy if exists "chat_sessions_insert_policy" on public.chat_sessions;
drop policy if exists "chat_sessions_update_policy" on public.chat_sessions;
drop policy if exists "chat_sessions_delete_policy" on public.chat_sessions;
drop policy if exists "chat_sessions_service_role_policy" on public.chat_sessions;

create policy "chat_sessions_select_policy"
on public.chat_sessions for select
to authenticated
using (user_id = auth.uid() or public.is_super_admin());

create policy "chat_sessions_insert_policy"
on public.chat_sessions for insert
to authenticated
with check (user_id = auth.uid() or public.is_super_admin());

create policy "chat_sessions_update_policy"
on public.chat_sessions for update
to authenticated
using (user_id = auth.uid() or public.is_super_admin())
with check (user_id = auth.uid() or public.is_super_admin());

create policy "chat_sessions_delete_policy"
on public.chat_sessions for delete
to authenticated
using (user_id = auth.uid() or public.is_super_admin());

create policy "chat_sessions_service_role_policy"
on public.chat_sessions for all
to service_role
using (true)
with check (true);

create table if not exists public.chat_messages (
  id bigserial primary key,
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'ai', 'system')),
  content text not null,
  image_data text,
  citations jsonb,
  thinking_text        text DEFAULT NULL,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

create index if not exists chat_messages_session_created_idx on public.chat_messages(session_id, created_at);
create index if not exists chat_messages_role_idx on public.chat_messages(role);

alter table public.chat_messages enable row level security;

drop policy if exists "chat_messages_select_policy" on public.chat_messages;
drop policy if exists "chat_messages_insert_policy" on public.chat_messages;
drop policy if exists "chat_messages_update_policy" on public.chat_messages;
drop policy if exists "chat_messages_delete_policy" on public.chat_messages;
drop policy if exists "chat_messages_service_role_policy" on public.chat_messages;

create policy "chat_messages_select_policy"
on public.chat_messages for select
to authenticated
using (
  exists (
    select 1
    from public.chat_sessions cs
    where cs.id = chat_messages.session_id
      and (cs.user_id = auth.uid() or public.is_super_admin())
  )
);

create policy "chat_messages_insert_policy"
on public.chat_messages for insert
to authenticated
with check (
  exists (
    select 1
    from public.chat_sessions cs
    where cs.id = chat_messages.session_id
      and (cs.user_id = auth.uid() or public.is_super_admin())
  )
);

create policy "chat_messages_update_policy"
on public.chat_messages for update
to authenticated
using (
  exists (
    select 1
    from public.chat_sessions cs
    where cs.id = chat_messages.session_id
      and (cs.user_id = auth.uid() or public.is_super_admin())
  )
)
with check (
  exists (
    select 1
    from public.chat_sessions cs
    where cs.id = chat_messages.session_id
      and (cs.user_id = auth.uid() or public.is_super_admin())
  )
);

create policy "chat_messages_delete_policy"
on public.chat_messages for delete
to authenticated
using (
  exists (
    select 1
    from public.chat_sessions cs
    where cs.id = chat_messages.session_id
      and (cs.user_id = auth.uid() or public.is_super_admin())
  )
);

create policy "chat_messages_service_role_policy"
on public.chat_messages for all
to service_role
using (true)
with check (true);

create table if not exists public.message_feedback (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.chat_sessions(id) on delete set null,
  message_id bigint references public.chat_messages(id) on delete set null,
  rating text not null check (rating in ('up', 'down', 'report')),
  category text,
  comments text,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

create index if not exists message_feedback_user_idx on public.message_feedback(user_id, created_at desc);
create index if not exists message_feedback_session_idx on public.message_feedback(session_id);

alter table public.message_feedback enable row level security;

drop policy if exists "message_feedback_select_policy" on public.message_feedback;
drop policy if exists "message_feedback_insert_policy" on public.message_feedback;
drop policy if exists "message_feedback_service_role_policy" on public.message_feedback;

create policy "message_feedback_select_policy"
on public.message_feedback for select
to authenticated
using (user_id = auth.uid() or public.is_super_admin());

create policy "message_feedback_insert_policy"
on public.message_feedback for insert
to authenticated
with check (user_id = auth.uid() or public.is_super_admin());

create policy "message_feedback_service_role_policy"
on public.message_feedback for all
to service_role
using (true)
with check (true);

create table if not exists public.faculty_knowledge (
  id uuid default gen_random_uuid() primary key,
  university_id uuid references public.universities(id) on delete restrict,
  level text not null,
  knowledge_text text not null,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

create index if not exists faculty_knowledge_level_idx on public.faculty_knowledge(level);
create index if not exists faculty_knowledge_university_id_idx on public.faculty_knowledge(university_id);

drop trigger if exists set_faculty_knowledge_updated_at on public.faculty_knowledge;
create trigger set_faculty_knowledge_updated_at
before update on public.faculty_knowledge
for each row execute function public.set_updated_at();

alter table public.faculty_knowledge enable row level security;

drop policy if exists "faculty_knowledge_select_policy" on public.faculty_knowledge;
drop policy if exists "faculty_knowledge_super_admin_policy" on public.faculty_knowledge;
drop policy if exists "faculty_knowledge_service_role_policy" on public.faculty_knowledge;

create policy "faculty_knowledge_select_policy"
on public.faculty_knowledge for select
to authenticated
using (true);

create policy "faculty_knowledge_super_admin_policy"
on public.faculty_knowledge for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "faculty_knowledge_service_role_policy"
on public.faculty_knowledge for all
to service_role
using (true)
with check (true);

create table if not exists public.quizzes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  course_code text not null,
  course_title text not null,
  topic text,
  level text not null,
  difficulty text not null default 'medium',
  num_questions integer not null,
  time_limit integer,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists quizzes_user_id_idx on public.quizzes(user_id);
create index if not exists quizzes_course_code_idx on public.quizzes(course_code);
create index if not exists quizzes_level_idx on public.quizzes(level);
create index if not exists quizzes_created_at_idx on public.quizzes(created_at desc);

drop trigger if exists set_quizzes_updated_at on public.quizzes;
create trigger set_quizzes_updated_at
before update on public.quizzes
for each row execute function public.set_updated_at();

alter table public.quizzes enable row level security;

drop policy if exists "Users can view own quizzes" on public.quizzes;
drop policy if exists "Users can insert own quizzes" on public.quizzes;
drop policy if exists "Users can update own quizzes" on public.quizzes;
drop policy if exists "Service role full access to quizzes" on public.quizzes;

create policy "Users can view own quizzes"
  on public.quizzes for select to authenticated
  using (user_id = auth.uid());

create policy "Users can insert own quizzes"
  on public.quizzes for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users can update own quizzes"
  on public.quizzes for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Service role full access to quizzes"
  on public.quizzes for all to service_role
  using (true) with check (true);

create table if not exists public.quiz_generation_jobs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  request_payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'retrieving', 'generating', 'saving', 'completed', 'failed', 'cancelled')),
  progress integer not null default 0 check (progress >= 0 and progress <= 100),
  current_step text,
  error_message text,
  quiz_id uuid references public.quizzes(id) on delete set null,
  generated_question_count integer not null default 0,
  target_question_count integer not null default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  completed_at timestamp with time zone
);

create index if not exists quiz_generation_jobs_user_id_idx
on public.quiz_generation_jobs(user_id);

create index if not exists quiz_generation_jobs_status_idx
on public.quiz_generation_jobs(status);

create index if not exists quiz_generation_jobs_created_at_idx
on public.quiz_generation_jobs(created_at desc);

drop trigger if exists set_quiz_generation_jobs_updated_at on public.quiz_generation_jobs;
create trigger set_quiz_generation_jobs_updated_at
before update on public.quiz_generation_jobs
for each row execute function public.set_updated_at();

alter table public.quiz_generation_jobs enable row level security;

drop policy if exists "Users can view own quiz generation jobs" on public.quiz_generation_jobs;
drop policy if exists "Users can insert own quiz generation jobs" on public.quiz_generation_jobs;
drop policy if exists "Service role full access to quiz_generation_jobs" on public.quiz_generation_jobs;

create policy "Users can view own quiz generation jobs"
  on public.quiz_generation_jobs for select to authenticated
  using (user_id = auth.uid());

create policy "Users can insert own quiz generation jobs"
  on public.quiz_generation_jobs for insert to authenticated
  with check (user_id = auth.uid());

create policy "Service role full access to quiz_generation_jobs"
  on public.quiz_generation_jobs for all to service_role
  using (true) with check (true);

create table if not exists public.quiz_questions (
  id uuid default gen_random_uuid() primary key,
  quiz_id uuid references public.quizzes(id) on delete cascade not null,
  question_text text not null,
  question_type text not null,
  options jsonb,
  correct_answer text not null,
  explanation text,
  points integer not null default 1,
  question_order integer not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists quiz_questions_quiz_id_idx on public.quiz_questions(quiz_id);
create index if not exists quiz_questions_order_idx on public.quiz_questions(question_order);

alter table public.quiz_questions enable row level security;

drop policy if exists "Users can view questions of own quizzes" on public.quiz_questions;
drop policy if exists "Users can insert questions for own quizzes" on public.quiz_questions;
drop policy if exists "Service role full access to quiz_questions" on public.quiz_questions;

create policy "Users can view questions of own quizzes"
  on public.quiz_questions for select to authenticated
  using (
    exists (
      select 1 from public.quizzes q
      where q.id = quiz_id and q.user_id = auth.uid()
    )
  );

create policy "Users can insert questions for own quizzes"
  on public.quiz_questions for insert to authenticated
  with check (
    exists (
      select 1 from public.quizzes q
      where q.id = quiz_id and q.user_id = auth.uid()
    )
  );

create policy "Service role full access to quiz_questions"
  on public.quiz_questions for all to service_role
  using (true) with check (true);

create table if not exists public.quiz_results (
  id uuid default gen_random_uuid() primary key,
  quiz_id uuid references public.quizzes(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  answers jsonb not null,
  score double precision not null,
  max_score double precision not null,
  percentage double precision not null,
  time_taken integer,
  feedback jsonb,
  completed_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists quiz_results_quiz_id_idx on public.quiz_results(quiz_id);
create index if not exists quiz_results_user_id_idx on public.quiz_results(user_id);
create index if not exists quiz_results_completed_at_idx on public.quiz_results(completed_at desc);

alter table public.quiz_results enable row level security;

drop policy if exists "Users can view own quiz results" on public.quiz_results;
drop policy if exists "Users can insert own quiz results" on public.quiz_results;
drop policy if exists "Service role full access to quiz_results" on public.quiz_results;

create policy "Users can view own quiz results"
  on public.quiz_results for select to authenticated
  using (user_id = auth.uid());

create policy "Users can insert own quiz results"
  on public.quiz_results for insert to authenticated
  with check (user_id = auth.uid());

create policy "Service role full access to quiz_results"
  on public.quiz_results for all to service_role
  using (true) with check (true);

create table if not exists public.timetables (
  id uuid default gen_random_uuid() primary key,
  university_id uuid references public.universities(id) on delete restrict,
  level text not null,
  day text not null,
  time_slot text not null,
  start_time text,
  course_code text not null,
  course_title text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint timetables_university_level_day_slot_course_key unique(university_id, level, day, time_slot, course_code)
);

create index if not exists timetables_level_day_idx on public.timetables(level, day);
create index if not exists timetables_start_time_idx on public.timetables(start_time);
create index if not exists timetables_university_id_idx on public.timetables(university_id);

drop trigger if exists set_timetables_updated_at on public.timetables;
create trigger set_timetables_updated_at
before update on public.timetables
for each row execute function public.set_updated_at();

alter table public.timetables enable row level security;

drop policy if exists "Authenticated users can view timetables" on public.timetables;
drop policy if exists "Service role full access to timetables" on public.timetables;
drop policy if exists "Super admin full access to timetables" on public.timetables;

create policy "Authenticated users can view timetables"
  on public.timetables for select to authenticated
  using (true);

create policy "Super admin full access to timetables"
  on public.timetables for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "Service role full access to timetables"
  on public.timetables for all to service_role
  using (true) with check (true);

create table if not exists public.document_progress (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id text not null,
  current_page integer not null default 1 check (current_page >= 1),
  total_pages integer not null default 1 check (total_pages >= 1),
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint document_progress_user_doc_unique unique (user_id, document_id)
);

create or replace function public.update_document_progress_timestamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists set_document_progress_updated_at on public.document_progress;
create trigger set_document_progress_updated_at
before update on public.document_progress
for each row execute function public.update_document_progress_timestamp();

alter table public.document_progress enable row level security;

drop policy if exists "document_progress_select_policy" on public.document_progress;
drop policy if exists "document_progress_insert_policy" on public.document_progress;
drop policy if exists "document_progress_update_policy" on public.document_progress;
drop policy if exists "document_progress_delete_policy" on public.document_progress;

create policy "document_progress_select_policy"
on public.document_progress for select
to authenticated
using (user_id = auth.uid());

create policy "document_progress_insert_policy"
on public.document_progress for insert
to authenticated
with check (user_id = auth.uid());

create policy "document_progress_update_policy"
on public.document_progress for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "document_progress_delete_policy"
on public.document_progress for delete
to authenticated
using (user_id = auth.uid());

create table if not exists public.web_search_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  count integer not null default 0 check (count >= 0),
  primary key (user_id, date)
);

create or replace function public.increment_web_search_usage(p_user_id uuid, p_date date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  insert into public.web_search_usage as wsu (user_id, date, count)
  values (p_user_id, p_date, 1)
  on conflict (user_id, date)
  do update set count = wsu.count + 1
  returning count into new_count;

  return new_count;
end;
$$;

revoke all on function public.increment_web_search_usage(uuid, date) from public;
grant execute on function public.increment_web_search_usage(uuid, date) to service_role;

alter table public.web_search_usage enable row level security;

drop policy if exists "web_search_usage_select_own" on public.web_search_usage;
drop policy if exists "web_search_usage_service_role_insert" on public.web_search_usage;
drop policy if exists "web_search_usage_service_role_update" on public.web_search_usage;
drop policy if exists "web_search_usage_service_role_delete" on public.web_search_usage;

create policy "web_search_usage_select_own"
on public.web_search_usage for select
to authenticated
using (user_id = auth.uid());

create policy "web_search_usage_service_role_insert"
on public.web_search_usage for insert
to service_role
with check (true);

create policy "web_search_usage_service_role_update"
on public.web_search_usage for update
to service_role
using (true)
with check (true);

create policy "web_search_usage_service_role_delete"
on public.web_search_usage for delete
to service_role
using (true);

create or replace function public.rollover_academic_context(
  p_university_id uuid,
  p_new_academic_session text,
  p_new_semester text,
  p_archive_previous_active_materials boolean,
  p_updated_by uuid,
  p_dry_run boolean default false
)
returns table (
  dry_run boolean,
  university_id uuid,
  previous_academic_session text,
  previous_semester text,
  new_academic_session text,
  new_semester text,
  archive_previous_active_materials boolean,
  archived_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev_session text;
  v_prev_semester text;
  v_has_existing_context boolean := false;
  v_archived_count integer := 0;
begin
  if p_university_id is null then
    raise exception 'university_id is required';
  end if;

  if nullif(btrim(coalesce(p_new_academic_session, '')), '') is null then
    raise exception 'new_academic_session is required';
  end if;

  if p_new_semester not in ('first', 'second') then
    raise exception 'new_semester must be first or second';
  end if;

  perform 1 from public.universities where id = p_university_id;
  if not found then
    raise exception 'University not found';
  end if;

  select ac.current_academic_session, ac.current_semester
  into v_prev_session, v_prev_semester
  from public.academic_contexts ac
  where ac.university_id = p_university_id
  for update;

  v_has_existing_context := found;

  if v_has_existing_context
    and coalesce(btrim(v_prev_session), '') = btrim(p_new_academic_session)
    and coalesce(v_prev_semester, '') = p_new_semester then
    raise exception 'New academic context matches the current context';
  end if;

  if v_has_existing_context and coalesce(v_prev_session, '') <> '' and coalesce(v_prev_semester, '') <> '' then
    select count(*)::int
    into v_archived_count
    from public.pans_library pl
    where pl.university_id = p_university_id
      and pl.academic_session = v_prev_session
      and pl.semester = v_prev_semester
      and pl.material_status = 'active';
  else
    v_archived_count := 0;
  end if;

  if not p_dry_run then
    if v_has_existing_context
      and p_archive_previous_active_materials
      and coalesce(v_prev_session, '') <> ''
      and coalesce(v_prev_semester, '') <> '' then
      update public.pans_library
      set material_status = 'archived',
          archived_at = now()
      where university_id = p_university_id
        and academic_session = v_prev_session
        and semester = v_prev_semester
        and material_status = 'active';
    end if;

    insert into public.academic_contexts (
      university_id,
      current_academic_session,
      current_semester,
      updated_by,
      updated_at
    )
    values (
      p_university_id,
      btrim(p_new_academic_session),
      p_new_semester,
      p_updated_by,
      now()
    )
    on conflict (university_id) do update
    set current_academic_session = excluded.current_academic_session,
        current_semester = excluded.current_semester,
        updated_by = excluded.updated_by,
        updated_at = now();
  end if;

  return query
  select
    p_dry_run,
    p_university_id,
    case when v_has_existing_context then v_prev_session else null end,
    case when v_has_existing_context then v_prev_semester else null end,
    btrim(p_new_academic_session),
    p_new_semester,
    p_archive_previous_active_materials,
    coalesce(v_archived_count, 0);
end;
$$;

revoke all on function public.rollover_academic_context(uuid, text, text, boolean, uuid, boolean) from public;
grant execute on function public.rollover_academic_context(uuid, text, text, boolean, uuid, boolean) to service_role;

create or replace function public.cancel_lecturer_material_submission(
  p_submission_id uuid,
  p_lecturer_user_id uuid,
  p_reason text default null
)
returns table (
  submission_id uuid,
  status text,
  drive_file_id text,
  original_drive_file_id text,
  converted_drive_file_id text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submission public.lecturer_material_submissions%rowtype;
  v_lecturer_user_id uuid;
  v_reason text;
begin
  if p_submission_id is null then
    raise exception 'submission_id is required';
  end if;
  if p_lecturer_user_id is null then
    raise exception 'lecturer_user_id is required';
  end if;

  select lms.*
  into v_submission
  from public.lecturer_material_submissions lms
  where lms.id = p_submission_id
  for update;

  if not found then
    raise exception 'Material submission not found';
  end if;

  select lp.user_id
  into v_lecturer_user_id
  from public.lecturer_profiles lp
  where lp.id = v_submission.lecturer_id
    and lp.university_id = v_submission.university_id;

  if not found then
    raise exception 'Lecturer profile not found for submission';
  end if;

  if v_lecturer_user_id is distinct from p_lecturer_user_id then
    raise exception 'You can only cancel your own material submissions';
  end if;

  if v_submission.status = 'cancelled' then
    if v_submission.cancelled_by is distinct from p_lecturer_user_id then
      raise exception 'This submission has already been cancelled';
    end if;

    return query
    select
      v_submission.id,
      v_submission.status,
      v_submission.drive_file_id,
      v_submission.original_drive_file_id,
      v_submission.converted_drive_file_id;
    return;
  end if;

  if v_submission.status = 'approved' then
    raise exception 'Approved submissions cannot be cancelled';
  end if;

  if v_submission.status = 'rejected' then
    raise exception 'Rejected submissions cannot be cancelled';
  end if;

  if v_submission.status <> 'pending_review' then
    raise exception 'Only pending submissions can be cancelled';
  end if;

  if v_submission.pans_library_id is not null then
    raise exception 'Linked submissions cannot be cancelled';
  end if;

  v_reason := nullif(trim(coalesce(p_reason, '')), '');

  update public.lecturer_material_submissions
  set
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_by = p_lecturer_user_id,
    cancellation_reason = v_reason,
    updated_at = now()
  where id = v_submission.id
  returning * into v_submission;

  return query
  select
    v_submission.id,
    v_submission.status,
    v_submission.drive_file_id,
    v_submission.original_drive_file_id,
    v_submission.converted_drive_file_id;
end;
$$;

revoke all on function public.cancel_lecturer_material_submission(uuid, uuid, text) from public;
grant execute on function public.cancel_lecturer_material_submission(uuid, uuid, text) to service_role;

create or replace function public.approve_lecturer_material_submission(
  p_submission_id uuid,
  p_reviewed_by uuid,
  p_review_note text default null,
  p_academic_session text default null,
  p_semester text default null
)
returns table (
  submission_id uuid,
  pans_library_id uuid,
  drive_file_id text,
  university_id uuid,
  status text,
  should_queue_ingestion boolean,
  already_approved boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submission lecturer_material_submissions%rowtype;
  v_drive_file_id text;
  v_library_row pans_library%rowtype;
  v_existing_link_id uuid;
  v_session text;
  v_semester text;
  v_lecturer_name text;
  v_lecturer_email text;
  v_should_queue boolean := false;
  v_already_approved boolean := false;
begin
  if p_submission_id is null then
    raise exception 'submission_id is required';
  end if;
  if p_reviewed_by is null then
    raise exception 'reviewed_by is required';
  end if;

  select *
  into v_submission
  from public.lecturer_material_submissions
  where id = p_submission_id
  for update;

  if not found then
    raise exception 'Material submission not found';
  end if;

  if v_submission.status = 'rejected' then
    raise exception 'Rejected submissions cannot be approved directly';
  end if;

  if coalesce(nullif(trim(v_submission.file_url), ''), '') = '' then
    raise exception 'Submitted material does not have a valid Drive file link';
  end if;
  if coalesce(nullif(trim(v_submission.title), ''), '') = '' then
    raise exception 'Submitted material is missing a topic/title';
  end if;
  if coalesce(nullif(trim(v_submission.course_code), ''), '') = '' then
    raise exception 'Submitted material is missing a course code';
  end if;

  v_drive_file_id := substring(v_submission.file_url from '/d/([^/]+)');
  if coalesce(v_drive_file_id, '') = '' then
    raise exception 'Submitted material does not have a valid Drive file link';
  end if;

  if p_semester is not null and p_semester not in ('first', 'second') then
    raise exception 'semester must be first or second';
  end if;

  if v_submission.status = 'approved' and v_submission.pans_library_id is not null then
    select *
    into v_library_row
    from public.pans_library
    where id = v_submission.pans_library_id
    for update;

    if not found then
      raise exception 'Approved submission has missing linked library document; manual review required';
    end if;

    v_already_approved := true;
    return query
    select
      v_submission.id,
      v_library_row.id,
      v_drive_file_id,
      v_submission.university_id,
      v_submission.status,
      false,
      v_already_approved;
    return;
  end if;

  -- Resolve semester/session defaults
  select
    coalesce(nullif(trim(p_academic_session), ''), ac.current_academic_session),
    coalesce(p_semester, ac.current_semester)
  into v_session, v_semester
  from public.academic_contexts ac
  where ac.university_id = v_submission.university_id;

  if v_submission.status = 'approved' and v_submission.pans_library_id is null then
    select *
    into v_library_row
    from public.pans_library
    where drive_file_id = v_drive_file_id
    for update;

    if not found then
      raise exception 'Approved submission is not linked to a library document; manual review required';
    end if;
    if v_library_row.university_id is distinct from v_submission.university_id then
      raise exception 'Recovered library document belongs to a different university; manual review required';
    end if;
    if lower(coalesce(v_library_row.source_type, '')) <> 'lecturer' then
      raise exception 'Recovered library document has incompatible source type; manual review required';
    end if;

    select lms.id
    into v_existing_link_id
    from public.lecturer_material_submissions lms
    where lms.pans_library_id = v_library_row.id
      and lms.id <> v_submission.id
    limit 1;

    if v_existing_link_id is not null then
      raise exception 'Recovered library document is already linked to another submission; manual review required';
    end if;

    update public.lecturer_material_submissions
    set pans_library_id = v_library_row.id
    where id = v_submission.id;

    return query
    select
      v_submission.id,
      v_library_row.id,
      v_drive_file_id,
      v_submission.university_id,
      'approved',
      false,
      true;
    return;
  end if;

  if v_submission.status <> 'pending_review' then
    raise exception 'Only pending submissions can be approved';
  end if;

  select *
  into v_library_row
  from public.pans_library
  where drive_file_id = v_drive_file_id
  for update;

  if found then
    if v_library_row.university_id is distinct from v_submission.university_id then
      raise exception 'A document with this Drive file already exists under a different university';
    end if;
    if lower(coalesce(v_library_row.source_type, '')) <> 'lecturer' then
      raise exception 'A document with this Drive file already exists with an incompatible source';
    end if;

    select lms.id
    into v_existing_link_id
    from public.lecturer_material_submissions lms
    where lms.pans_library_id = v_library_row.id
      and lms.id <> v_submission.id
    limit 1;

    if v_existing_link_id is not null then
      raise exception 'This library document is already linked to another lecturer submission';
    end if;
  else
    select
      trim(concat_ws(' ', nullif(lp.title, ''), nullif(lp.full_name, ''))),
      lp.email
    into v_lecturer_name, v_lecturer_email
    from public.lecturer_profiles lp
    where lp.id = v_submission.lecturer_id;

    if coalesce(nullif(trim(v_lecturer_name), ''), '') = '' then
      v_lecturer_name := 'Lecturer';
    end if;

    insert into public.pans_library (
      title,
      course_code,
      lecturer_name,
      topic,
      drive_file_id,
      file_name,
      file_size,
      university_id,
      uploaded_by_email,
      target_levels,
      academic_session,
      semester,
      material_status,
      visibility,
      source_type,
      approval_status,
      embedding_status,
      embedding_progress,
      total_chunks,
      embedding_error
    ) values (
      v_submission.title,
      v_submission.course_code,
      v_lecturer_name,
      v_submission.title,
      v_drive_file_id,
      coalesce(nullif(trim(v_submission.file_name), ''), 'lecturer-material.pdf'),
      0,
      v_submission.university_id,
      v_lecturer_email,
      array[]::text[],
      v_session,
      v_semester,
      'active',
      'visible',
      'lecturer',
      'approved',
      'pending',
      0,
      0,
      null
    )
    returning * into v_library_row;
  end if;

  execute
    'update public.lecturer_material_submissions
     set
       status = $1,
       pans_library_id = $2,
       reviewed_by = $3,
       reviewed_at = now(),
       review_note = $4
     where id = $5'
  using
    'approved',
    v_library_row.id,
    p_reviewed_by,
    p_review_note,
    v_submission.id;

  v_should_queue := coalesce(v_library_row.embedding_status, 'pending') in ('pending', 'failed');

  return query
  select
    v_submission.id,
    v_library_row.id,
    v_drive_file_id,
    v_submission.university_id,
    'approved',
    v_should_queue,
    false;
end;
$$;

revoke all on function public.approve_lecturer_material_submission(uuid, uuid, text, text, text) from public;
grant execute on function public.approve_lecturer_material_submission(uuid, uuid, text, text, text) to service_role;

create or replace function public.claim_document_ingestion_worker(
  p_document_id uuid,
  p_ingestion_run_id uuid,
  p_worker_id uuid
)
returns table (
  document_id uuid,
  ingestion_run_id uuid,
  worker_id uuid,
  claimed boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_run_id uuid;
  v_worker_id uuid;
begin
  if p_document_id is null then
    raise exception 'document_id is required';
  end if;
  if p_ingestion_run_id is null then
    raise exception 'ingestion_run_id is required';
  end if;
  if p_worker_id is null then
    raise exception 'worker_id is required';
  end if;

  select pl.embedding_status, pl.ingestion_run_id, pl.ingestion_worker_id
  into v_status, v_run_id, v_worker_id
  from public.pans_library pl
  where pl.id = p_document_id
  for update;

  if not found or v_status <> 'processing' or v_run_id is distinct from p_ingestion_run_id then
    return query select p_document_id, p_ingestion_run_id, p_worker_id, false;
    return;
  end if;

  if v_worker_id is null or v_worker_id = p_worker_id then
    update public.pans_library pl
    set ingestion_worker_id = p_worker_id,
        ingestion_worker_claimed_at = coalesce(pl.ingestion_worker_claimed_at, now()),
        ingestion_worker_heartbeat_at = now(),
        last_updated_at = now()
    where pl.id = p_document_id;

    return query select p_document_id, p_ingestion_run_id, p_worker_id, true;
    return;
  end if;

  return query select p_document_id, p_ingestion_run_id, p_worker_id, false;
end;
$$;

revoke all on function public.claim_document_ingestion_worker(uuid, uuid, uuid) from public;
grant execute on function public.claim_document_ingestion_worker(uuid, uuid, uuid) to service_role;

create or replace function public.heartbeat_document_ingestion_worker(
  p_document_id uuid,
  p_ingestion_run_id uuid,
  p_worker_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.pans_library pl
  set ingestion_worker_heartbeat_at = now(),
      last_updated_at = now()
  where pl.id = p_document_id
    and pl.embedding_status = 'processing'
    and pl.ingestion_run_id = p_ingestion_run_id
    and pl.ingestion_worker_id = p_worker_id;

  return found;
end;
$$;

revoke all on function public.heartbeat_document_ingestion_worker(uuid, uuid, uuid) from public;
grant execute on function public.heartbeat_document_ingestion_worker(uuid, uuid, uuid) to service_role;

create or replace function public.claim_document_ingestion(
  p_document_id uuid,
  p_delete_existing_embeddings boolean default false
)
returns table (
  document_id uuid,
  embedding_status text,
  ingestion_run_id uuid,
  should_queue_ingestion boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_embedding_status text;
  v_ingestion_run_id uuid := gen_random_uuid();
begin
  if p_document_id is null then
    raise exception 'document_id is required';
  end if;

  select pl.embedding_status
  into v_embedding_status
  from public.pans_library pl
  where pl.id = p_document_id
  for update;

  if not found then
    raise exception 'Document not found';
  end if;

  if v_embedding_status = 'processing' then
    raise exception 'This document is already being processed. Wait for the current ingestion to finish before retrying.';
  end if;

  if p_delete_existing_embeddings then
    delete from public.document_embeddings de
    where de.document_id = p_document_id;
  end if;

  update public.pans_library pl
  set
    embedding_status = 'processing',
    embedding_progress = 0,
    total_chunks = 0,
    embedding_error = null,
    failed_chunks_count = 0,
    error_log = null,
    ingestion_run_id = v_ingestion_run_id,
    ingestion_worker_id = null,
    ingestion_worker_claimed_at = null,
    ingestion_worker_heartbeat_at = null,
    last_updated_at = now()
  where pl.id = p_document_id;

  return query
  select
    p_document_id,
    'processing'::text,
    v_ingestion_run_id,
    true;
end;
$$;

revoke all on function public.claim_document_ingestion(uuid, boolean) from public;
grant execute on function public.claim_document_ingestion(uuid, boolean) to service_role;

create or replace function public.prepare_document_reembed(
  p_document_id uuid,
  p_allow_stale_processing_retry boolean default false
)
returns table (
  document_id uuid,
  embedding_status text,
  ingestion_run_id uuid,
  should_queue_ingestion boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_embedding_status text;
  v_heartbeat_at timestamptz;
  v_ingestion_run_id uuid := gen_random_uuid();
begin
  if p_document_id is null then
    raise exception 'document_id is required';
  end if;

  select pl.embedding_status, pl.ingestion_worker_heartbeat_at
  into v_embedding_status, v_heartbeat_at
  from public.pans_library pl
  where pl.id = p_document_id
  for update;

  if not found then
    raise exception 'Document not found';
  end if;

  if v_embedding_status = 'processing'
     and (
       not p_allow_stale_processing_retry
       or coalesce(v_heartbeat_at, now()) > now() - interval '15 minutes'
     ) then
    raise exception 'This document is already being processed. Wait for the current ingestion to finish before retrying.';
  end if;

  delete from public.document_embeddings de
  where de.document_id = p_document_id;

  update public.pans_library pl
  set
    embedding_status = 'processing',
    embedding_progress = 0,
    total_chunks = 0,
    embedding_error = null,
    failed_chunks_count = 0,
    error_log = null,
    ingestion_run_id = v_ingestion_run_id,
    ingestion_worker_id = null,
    ingestion_worker_claimed_at = null,
    ingestion_worker_heartbeat_at = null,
    last_updated_at = now()
  where pl.id = p_document_id;

  return query
  select
    p_document_id,
    'processing'::text,
    v_ingestion_run_id,
    true;
end;
$$;

revoke all on function public.prepare_document_reembed(uuid, boolean) from public;
grant execute on function public.prepare_document_reembed(uuid, boolean) to service_role;
