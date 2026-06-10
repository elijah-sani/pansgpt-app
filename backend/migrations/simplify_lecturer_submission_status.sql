-- Normalize legacy lecturer submission processing states into review-only states,
-- then tighten constraint to review-only status values.

begin;

update public.lecturer_material_submissions
set status = 'approved'
where status in ('ingesting', 'ingested');

update public.lecturer_material_submissions
set status = 'approved'
where status = 'failed'
  and pans_library_id is not null;

update public.lecturer_material_submissions
set status = 'pending_review'
where status = 'failed'
  and pans_library_id is null;

alter table public.lecturer_material_submissions
drop constraint if exists lecturer_material_submissions_status_check;

alter table public.lecturer_material_submissions
add constraint lecturer_material_submissions_status_check
check (status in ('pending_review', 'approved', 'rejected'));

commit;

