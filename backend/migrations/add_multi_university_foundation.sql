alter table public.profiles
add column if not exists university_id uuid references public.universities(id) on delete set null;

create index if not exists profiles_university_id_idx
on public.profiles (university_id);

with matched_universities as (
  select
    p.id as profile_id,
    (min(u.id::text))::uuid as university_id,
    count(*) as match_count
  from public.profiles p
  join public.universities u
    on (
      lower(btrim(p.university)) = lower(btrim(u.name))
      or (
        u.short_name is not null
        and lower(btrim(p.university)) = lower(btrim(u.short_name))
      )
    )
  where p.university_id is null
    and p.university is not null
    and btrim(p.university) <> ''
  group by p.id
)
update public.profiles p
set university_id = matched_universities.university_id
from matched_universities
where p.id = matched_universities.profile_id
  and matched_universities.match_count = 1
  and p.university_id is null;

alter table public.user_roles
add column if not exists university_id uuid references public.universities(id) on delete set null;

create index if not exists user_roles_university_id_idx
on public.user_roles (university_id);

create index if not exists user_roles_role_idx
on public.user_roles (role);

alter table public.user_roles
drop constraint if exists user_roles_role_check;

alter table public.user_roles
add constraint user_roles_role_check
check (role in ('admin', 'super_admin', 'global_admin', 'university_admin'));

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
