create or replace function public.approve_lecturer_material_submission(
  p_submission_id uuid,
  p_reviewed_by uuid,
  p_review_note text default null,
  p_academic_session text default null,
  p_semester text default null
)
returns table (
  submission_id uuid,
  pans_library_id uuid,
  drive_file_id text,
  university_id uuid,
  status text,
  should_queue_ingestion boolean,
  already_approved boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submission lecturer_material_submissions%rowtype;
  v_drive_file_id text;
  v_library_row pans_library%rowtype;
  v_existing_link_id uuid;
  v_session text;
  v_semester text;
  v_lecturer_name text;
  v_lecturer_email text;
  v_should_queue boolean := false;
  v_already_approved boolean := false;
begin
  if p_submission_id is null then
    raise exception 'submission_id is required';
  end if;
  if p_reviewed_by is null then
    raise exception 'reviewed_by is required';
  end if;

  select *
  into v_submission
  from public.lecturer_material_submissions
  where id = p_submission_id
  for update;

  if not found then
    raise exception 'Material submission not found';
  end if;

  if v_submission.status = 'rejected' then
    raise exception 'Rejected submissions cannot be approved directly';
  end if;

  if coalesce(nullif(trim(v_submission.file_url), ''), '') = '' then
    raise exception 'Submitted material does not have a valid Drive file link';
  end if;
  if coalesce(nullif(trim(v_submission.title), ''), '') = '' then
    raise exception 'Submitted material is missing a topic/title';
  end if;
  if coalesce(nullif(trim(v_submission.course_code), ''), '') = '' then
    raise exception 'Submitted material is missing a course code';
  end if;

  v_drive_file_id := substring(v_submission.file_url from '/d/([^/]+)');
  if coalesce(v_drive_file_id, '') = '' then
    raise exception 'Submitted material does not have a valid Drive file link';
  end if;

  if p_semester is not null and p_semester not in ('first', 'second') then
    raise exception 'semester must be first or second';
  end if;

  if v_submission.status = 'approved' and v_submission.pans_library_id is not null then
    select *
    into v_library_row
    from public.pans_library
    where id = v_submission.pans_library_id
    for update;

    if not found then
      raise exception 'Approved submission has missing linked library document; manual review required';
    end if;

    v_already_approved := true;
    return query
    select
      v_submission.id,
      v_library_row.id,
      v_drive_file_id,
      v_submission.university_id,
      v_submission.status,
      false,
      v_already_approved;
    return;
  end if;

  -- Resolve semester/session defaults
  select
    coalesce(nullif(trim(p_academic_session), ''), ac.current_academic_session),
    coalesce(p_semester, ac.current_semester)
  into v_session, v_semester
  from public.academic_contexts ac
  where ac.university_id = v_submission.university_id;

  if v_submission.status = 'approved' and v_submission.pans_library_id is null then
    select *
    into v_library_row
    from public.pans_library
    where drive_file_id = v_drive_file_id
    for update;

    if not found then
      raise exception 'Approved submission is not linked to a library document; manual review required';
    end if;
    if v_library_row.university_id is distinct from v_submission.university_id then
      raise exception 'Recovered library document belongs to a different university; manual review required';
    end if;
    if lower(coalesce(v_library_row.source_type, '')) <> 'lecturer' then
      raise exception 'Recovered library document has incompatible source type; manual review required';
    end if;

    select lms.id
    into v_existing_link_id
    from public.lecturer_material_submissions lms
    where lms.pans_library_id = v_library_row.id
      and lms.id <> v_submission.id
    limit 1;

    if v_existing_link_id is not null then
      raise exception 'Recovered library document is already linked to another submission; manual review required';
    end if;

    update public.lecturer_material_submissions
    set pans_library_id = v_library_row.id
    where id = v_submission.id;

    return query
    select
      v_submission.id,
      v_library_row.id,
      v_drive_file_id,
      v_submission.university_id,
      'approved',
      false,
      true;
    return;
  end if;

  if v_submission.status <> 'pending_review' then
    raise exception 'Only pending submissions can be approved';
  end if;

  select *
  into v_library_row
  from public.pans_library
  where drive_file_id = v_drive_file_id
  for update;

  if found then
    if v_library_row.university_id is distinct from v_submission.university_id then
      raise exception 'A document with this Drive file already exists under a different university';
    end if;
    if lower(coalesce(v_library_row.source_type, '')) <> 'lecturer' then
      raise exception 'A document with this Drive file already exists with an incompatible source';
    end if;

    select lms.id
    into v_existing_link_id
    from public.lecturer_material_submissions lms
    where lms.pans_library_id = v_library_row.id
      and lms.id <> v_submission.id
    limit 1;

    if v_existing_link_id is not null then
      raise exception 'This library document is already linked to another lecturer submission';
    end if;
  else
    select
      trim(concat_ws(' ', nullif(lp.title, ''), nullif(lp.full_name, ''))),
      lp.email
    into v_lecturer_name, v_lecturer_email
    from public.lecturer_profiles lp
    where lp.id = v_submission.lecturer_id;

    if coalesce(nullif(trim(v_lecturer_name), ''), '') = '' then
      v_lecturer_name := 'Lecturer';
    end if;

    insert into public.pans_library (
      title,
      course_code,
      lecturer_name,
      topic,
      drive_file_id,
      file_name,
      file_size,
      university_id,
      uploaded_by_email,
      target_levels,
      academic_session,
      semester,
      material_status,
      visibility,
      source_type,
      approval_status,
      embedding_status,
      embedding_progress,
      total_chunks,
      embedding_error
    ) values (
      v_submission.title,
      v_submission.course_code,
      v_lecturer_name,
      v_submission.title,
      v_drive_file_id,
      coalesce(nullif(trim(v_submission.file_name), ''), 'lecturer-material.pdf'),
      0,
      v_submission.university_id,
      v_lecturer_email,
      array[]::text[],
      v_session,
      v_semester,
      'active',
      'visible',
      'lecturer',
      'approved',
      'pending',
      0,
      0,
      null
    )
    returning * into v_library_row;
  end if;

  execute
    'update public.lecturer_material_submissions
     set
       status = $1,
       pans_library_id = $2,
       reviewed_by = $3,
       reviewed_at = now(),
       review_note = $4
     where id = $5'
  using
    'approved',
    v_library_row.id,
    p_reviewed_by,
    p_review_note,
    v_submission.id;

  v_should_queue := coalesce(v_library_row.embedding_status, 'pending') in ('pending', 'failed');

  return query
  select
    v_submission.id,
    v_library_row.id,
    v_drive_file_id,
    v_submission.university_id,
    'approved',
    v_should_queue,
    false;
end;
$$;

revoke all on function public.approve_lecturer_material_submission(uuid, uuid, text, text, text) from public;
grant execute on function public.approve_lecturer_material_submission(uuid, uuid, text, text, text) to service_role;
