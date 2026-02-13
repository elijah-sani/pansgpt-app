-- Run this in your Supabase SQL Editor

-- 1. Create the user_roles table
create table if not exists public.user_roles (
  id uuid default gen_random_uuid() primary key,
  email text unique not null,
  role text not null check (role in ('admin', 'super_admin')),
  is_admin boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Enable RLS
alter table public.user_roles enable row level security;

-- 3. Policies
-- Allow anyone logged in to view the list (so they can see their own role and others)
create policy "Enable read access for authenticated users"
on public.user_roles for select
to authenticated
using (true);

-- Allow anyone logged in to insert (needed for 'Invite User' functionality from frontend)
-- Ideally, you'd restrict this to only super_admins, but let's start permissive for the UI to work.
create policy "Enable insert for authenticated users"
on public.user_roles for insert
to authenticated
with check (true);

-- Allow deletion
create policy "Enable delete for authenticated users"
on public.user_roles for delete
to authenticated
using (true);

-- 4. Seed your Super Admin user
-- Replace with your actual email if different
insert into public.user_roles (email, role, is_admin)
values 
  ('veacedev@gmail.com', 'super_admin', true),
  ('hello@pansgpt.site', 'super_admin', true)
on conflict (email) do nothing;

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
