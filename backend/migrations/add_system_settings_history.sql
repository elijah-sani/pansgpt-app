create table if not exists public.system_settings_history (
  id uuid primary key default gen_random_uuid(),
  system_prompt text,
  temperature double precision not null default 0.7,
  maintenance_mode boolean not null default false,
  web_search_enabled boolean not null default true,
  rag_threshold double precision null default 0.50,
  changed_by_user_id uuid null references public.profiles(id) on delete set null,
  changed_by_email text null,
  change_reason text null,
  change_type text not null default 'update' check (change_type in ('update', 'rollback')),
  rolled_back_from_id uuid null references public.system_settings_history(id) on delete set null,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

create index if not exists system_settings_history_created_at_idx
  on public.system_settings_history(created_at desc);

alter table public.system_settings_history enable row level security;

drop policy if exists "system_settings_history_select_policy" on public.system_settings_history;
drop policy if exists "system_settings_history_super_admin_policy" on public.system_settings_history;
drop policy if exists "system_settings_history_service_role_policy" on public.system_settings_history;

create policy "system_settings_history_select_policy"
on public.system_settings_history for select
to authenticated
using (public.is_super_admin());

create policy "system_settings_history_super_admin_policy"
on public.system_settings_history for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "system_settings_history_service_role_policy"
on public.system_settings_history for all
to service_role
using (true)
with check (true);
