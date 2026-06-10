alter table public.pans_library
add column if not exists academic_session text,
add column if not exists semester text,
add column if not exists department text,
add column if not exists faculty text,
add column if not exists material_status text default 'active',
add column if not exists visibility text default 'visible',
add column if not exists source_type text default 'admin',
add column if not exists approval_status text default 'approved',
add column if not exists approved_by uuid,
add column if not exists approved_at timestamp with time zone,
add column if not exists archived_at timestamp with time zone,
add column if not exists version_label text,
add column if not exists replaces_document_id uuid references public.pans_library(id) on delete set null;

update public.pans_library
set
  material_status = coalesce(nullif(trim(material_status), ''), 'active'),
  visibility = coalesce(nullif(trim(visibility), ''), 'visible'),
  source_type = coalesce(nullif(trim(source_type), ''), 'admin'),
  approval_status = coalesce(nullif(trim(approval_status), ''), 'approved')
where
  material_status is null
  or trim(material_status) = ''
  or visibility is null
  or trim(visibility) = ''
  or source_type is null
  or trim(source_type) = ''
  or approval_status is null
  or trim(approval_status) = '';

alter table public.pans_library
alter column material_status set default 'active',
alter column visibility set default 'visible',
alter column source_type set default 'admin',
alter column approval_status set default 'approved';

create index if not exists pans_library_course_code_idx
on public.pans_library (course_code);

create index if not exists pans_library_academic_session_idx
on public.pans_library (academic_session);

create index if not exists pans_library_semester_idx
on public.pans_library (semester);

create index if not exists pans_library_material_status_idx
on public.pans_library (material_status);

create index if not exists pans_library_visibility_idx
on public.pans_library (visibility);

create index if not exists pans_library_approval_status_idx
on public.pans_library (approval_status);

create index if not exists pans_library_source_type_idx
on public.pans_library (source_type);
