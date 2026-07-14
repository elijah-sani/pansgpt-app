create table if not exists public.system_settings_change_requests (
  id uuid primary key default gen_random_uuid(),
  system_prompt text not null,
  temperature double precision not null default 0.7,
  maintenance_mode boolean not null default false,
  web_search_enabled boolean not null default true,
  rag_threshold double precision null default 0.50,
  change_reason text not null,
  status text not null default 'draft' check (status in ('draft', 'review', 'approved', 'published', 'rejected')),
  note text null,
  lint_warnings jsonb not null default '[]'::jsonb,
  requested_by_user_id uuid null references public.profiles(id) on delete set null,
  requested_by_email text null,
  reviewed_by_user_id uuid null references public.profiles(id) on delete set null,
  reviewed_by_email text null,
  approved_by_user_id uuid null references public.profiles(id) on delete set null,
  approved_by_email text null,
  published_by_user_id uuid null references public.profiles(id) on delete set null,
  published_by_email text null,
  history_entry_id uuid null references public.system_settings_history(id) on delete set null,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

drop trigger if exists set_system_settings_change_requests_updated_at on public.system_settings_change_requests;
create trigger set_system_settings_change_requests_updated_at
before update on public.system_settings_change_requests
for each row execute function public.set_updated_at();

create index if not exists system_settings_change_requests_updated_at_idx
  on public.system_settings_change_requests(updated_at desc);

alter table public.system_settings_change_requests enable row level security;

drop policy if exists "system_settings_change_requests_select_policy" on public.system_settings_change_requests;
drop policy if exists "system_settings_change_requests_super_admin_policy" on public.system_settings_change_requests;
drop policy if exists "system_settings_change_requests_service_role_policy" on public.system_settings_change_requests;

create policy "system_settings_change_requests_select_policy"
on public.system_settings_change_requests for select
to authenticated
using (public.is_super_admin());

create policy "system_settings_change_requests_super_admin_policy"
on public.system_settings_change_requests for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "system_settings_change_requests_service_role_policy"
on public.system_settings_change_requests for all
to service_role
using (true)
with check (true);
