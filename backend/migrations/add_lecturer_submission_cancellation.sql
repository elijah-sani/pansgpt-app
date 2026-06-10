alter table public.lecturer_material_submissions
add column if not exists cancelled_at timestamptz,
add column if not exists cancelled_by uuid references auth.users(id) on delete set null,
add column if not exists cancellation_reason text,
add column if not exists drive_file_id text,
add column if not exists original_drive_file_id text,
add column if not exists converted_drive_file_id text;

alter table public.lecturer_material_submissions
drop constraint if exists lecturer_material_submissions_status_check;

alter table public.lecturer_material_submissions
add constraint lecturer_material_submissions_status_check
check (status in ('pending_review', 'approved', 'rejected', 'cancelled'));

update public.lecturer_material_submissions
set drive_file_id = substring(file_url from '/file/d/([^/?#]+)')
where drive_file_id is null
  and file_url ~ '/file/d/[A-Za-z0-9_-]+';

update public.lecturer_material_submissions
set original_drive_file_id = drive_file_id
where original_drive_file_id is null
  and converted_drive_file_id is null
  and drive_file_id is not null
  and lower(coalesce(file_type, '')) <> 'pdf';

create index if not exists lecturer_material_submissions_cancelled_at_idx
on public.lecturer_material_submissions (cancelled_at);

create index if not exists lecturer_material_submissions_drive_file_id_idx
on public.lecturer_material_submissions (drive_file_id);

create index if not exists lecturer_material_submissions_original_drive_file_id_idx
on public.lecturer_material_submissions (original_drive_file_id);

create index if not exists lecturer_material_submissions_converted_drive_file_id_idx
on public.lecturer_material_submissions (converted_drive_file_id);

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
