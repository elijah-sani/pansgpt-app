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
where lower(au.email) in ('elijahsani1@gmail.com', 'hello@pansgpt.site', 'elijahsani.creative@gmail.com')
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
