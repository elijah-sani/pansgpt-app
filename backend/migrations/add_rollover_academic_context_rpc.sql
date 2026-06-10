create or replace function public.rollover_academic_context(
  p_university_id uuid,
  p_new_academic_session text,
  p_new_semester text,
  p_archive_previous_active_materials boolean,
  p_updated_by uuid,
  p_dry_run boolean default false
)
returns table (
  dry_run boolean,
  university_id uuid,
  previous_academic_session text,
  previous_semester text,
  new_academic_session text,
  new_semester text,
  archive_previous_active_materials boolean,
  archived_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev_session text;
  v_prev_semester text;
  v_has_existing_context boolean := false;
  v_archived_count integer := 0;
begin
  if p_university_id is null then
    raise exception 'university_id is required';
  end if;

  if nullif(btrim(coalesce(p_new_academic_session, '')), '') is null then
    raise exception 'new_academic_session is required';
  end if;

  if p_new_semester not in ('first', 'second') then
    raise exception 'new_semester must be first or second';
  end if;

  perform 1 from public.universities where id = p_university_id;
  if not found then
    raise exception 'University not found';
  end if;

  select ac.current_academic_session, ac.current_semester
  into v_prev_session, v_prev_semester
  from public.academic_contexts ac
  where ac.university_id = p_university_id
  for update;

  v_has_existing_context := found;

  if v_has_existing_context
    and coalesce(btrim(v_prev_session), '') = btrim(p_new_academic_session)
    and coalesce(v_prev_semester, '') = p_new_semester then
    raise exception 'New academic context matches the current context';
  end if;

  if v_has_existing_context and coalesce(v_prev_session, '') <> '' and coalesce(v_prev_semester, '') <> '' then
    select count(*)::int
    into v_archived_count
    from public.pans_library pl
    where pl.university_id = p_university_id
      and pl.academic_session = v_prev_session
      and pl.semester = v_prev_semester
      and pl.material_status = 'active';
  else
    v_archived_count := 0;
  end if;

  if not p_dry_run then
    if v_has_existing_context
      and p_archive_previous_active_materials
      and coalesce(v_prev_session, '') <> ''
      and coalesce(v_prev_semester, '') <> '' then
      update public.pans_library
      set material_status = 'archived',
          archived_at = now()
      where university_id = p_university_id
        and academic_session = v_prev_session
        and semester = v_prev_semester
        and material_status = 'active';
    end if;

    insert into public.academic_contexts (
      university_id,
      current_academic_session,
      current_semester,
      updated_by,
      updated_at
    )
    values (
      p_university_id,
      btrim(p_new_academic_session),
      p_new_semester,
      p_updated_by,
      now()
    )
    on conflict (university_id) do update
    set current_academic_session = excluded.current_academic_session,
        current_semester = excluded.current_semester,
        updated_by = excluded.updated_by,
        updated_at = now();
  end if;

  return query
  select
    p_dry_run,
    p_university_id,
    case when v_has_existing_context then v_prev_session else null end,
    case when v_has_existing_context then v_prev_semester else null end,
    btrim(p_new_academic_session),
    p_new_semester,
    p_archive_previous_active_materials,
    coalesce(v_archived_count, 0);
end;
$$;

revoke all on function public.rollover_academic_context(uuid, text, text, boolean, uuid, boolean) from public;
grant execute on function public.rollover_academic_context(uuid, text, text, boolean, uuid, boolean) to service_role;
