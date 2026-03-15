-- Run this in your Supabase SQL Editor

-- 1. Create the user_roles table
create table if not exists public.user_roles (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  email text unique not null,
  role text not null check (role in ('admin', 'super_admin')),
  is_admin boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Backfill user_id from auth.users by email for existing rows
update public.user_roles ur
set user_id = au.id
from auth.users au
where lower(ur.email) = lower(au.email)
  and ur.user_id is null;

-- Ensure one role row per auth user identity (when user_id exists)
create unique index if not exists user_roles_user_id_uidx
on public.user_roles (user_id)
where user_id is not null;

-- 2. Enable RLS
alter table public.user_roles enable row level security;

-- 3. Policies
drop policy if exists "Enable read access for authenticated users" on public.user_roles;
drop policy if exists "Enable insert for authenticated users" on public.user_roles;
drop policy if exists "Enable delete for authenticated users" on public.user_roles;
drop policy if exists "user_roles_select_policy" on public.user_roles;
drop policy if exists "user_roles_insert_policy" on public.user_roles;
drop policy if exists "user_roles_update_policy" on public.user_roles;
drop policy if exists "user_roles_delete_policy" on public.user_roles;

-- SECURITY DEFINER helper to evaluate super-admin state safely during RLS checks
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
      and ur.role = 'super_admin'
  );
$$;

revoke all on function public.is_super_admin() from public;
grant execute on function public.is_super_admin() to authenticated;

-- Normal authenticated users can only read their own role.
-- Super admins can read all role rows.
create policy "user_roles_select_policy"
on public.user_roles for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_super_admin()
);

-- Only verified super admins can create role rows.
create policy "user_roles_insert_policy"
on public.user_roles for insert
to authenticated
with check (public.is_super_admin());

-- Only verified super admins can modify role rows.
create policy "user_roles_update_policy"
on public.user_roles for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

-- Only verified super admins can delete role rows.
create policy "user_roles_delete_policy"
on public.user_roles for delete
to authenticated
using (public.is_super_admin());

-- 4. Seed your Super Admin user
-- Replace with your actual email if different
insert into public.user_roles (user_id, email, role, is_admin)
select au.id, au.email, 'super_admin', true
from auth.users au
where lower(au.email) in ('elijahsani.creative@gmail.com')
on conflict (email) do update
set user_id = excluded.user_id,
    role = excluded.role,
    is_admin = excluded.is_admin;

-- 5. Create system_settings table
create table if not exists public.system_settings (
  id integer primary key default 1,
  system_prompt text,
  temperature float default 0.7,
  maintenance_mode boolean default false,
  rag_threshold float default 0.50,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint check_temperature check (temperature >= 0.0 and temperature <= 1.0)
);

-- Seed default config
insert into public.system_settings (id, system_prompt, temperature, maintenance_mode)
values (1, 'You are PansGPT, an expert Pharmacy Tutor.', 0.7, false)
on conflict (id) do nothing;

-- 6. Enable RLS (Optional, since backend uses Service Role)
alter table public.system_settings enable row level security;

create policy "Enable read access for authenticated users"
on public.system_settings for select
to authenticated
using (true);

create policy "Enable full access for service role"
on public.system_settings for all
to service_role
using (true)
with check (true);

-- =============================================================
-- 7. Smart Resume: document_progress table
-- =============================================================
create table if not exists public.document_progress (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  document_id text not null,
  current_page integer not null default 1 check (current_page >= 1),
  total_pages  integer not null default 1 check (total_pages >= 1),
  updated_at   timestamp with time zone default timezone('utc'::text, now()) not null,

  -- Unique constraint: one progress record per (user, document)
  -- Enables clean upserts without duplicates
  constraint document_progress_user_doc_unique unique (user_id, document_id)
);

-- Auto-update updated_at on every write
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

-- Enable RLS
alter table public.document_progress enable row level security;

-- Users can only read their own progress
create policy "document_progress_select_policy"
on public.document_progress for select
to authenticated
using (user_id = auth.uid());

-- Users can insert their own progress rows
create policy "document_progress_insert_policy"
on public.document_progress for insert
to authenticated
with check (user_id = auth.uid());

-- Users can update their own progress rows
create policy "document_progress_update_policy"
on public.document_progress for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Users can delete their own progress (for data hygiene)
create policy "document_progress_delete_policy"
on public.document_progress for delete
to authenticated
using (user_id = auth.uid());

-- =============================================================
-- 8. Web search daily usage table
-- =============================================================
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
