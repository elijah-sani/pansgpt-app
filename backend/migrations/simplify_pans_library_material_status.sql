-- Simplify pans_library material lifecycle.
-- pans_library rows represent approved library materials only.
-- visibility and approval_status are retained temporarily as legacy columns,
-- but no longer control app behavior.

update public.pans_library
set
  visibility = 'visible',
  approval_status = 'approved',
  material_status = case
    when lower(trim(coalesce(material_status, ''))) = 'archived' then 'archived'
    else 'active'
  end
where
  visibility is distinct from 'visible'
  or approval_status is distinct from 'approved'
  or lower(trim(coalesce(material_status, ''))) not in ('active', 'archived');

alter table public.pans_library
alter column material_status set default 'active';

alter table public.pans_library
alter column material_status set not null;

alter table public.pans_library
drop constraint if exists pans_library_material_status_check;

alter table public.pans_library
add constraint pans_library_material_status_check
check (material_status in ('active', 'archived'));

create index if not exists pans_library_material_status_idx
on public.pans_library (material_status);
