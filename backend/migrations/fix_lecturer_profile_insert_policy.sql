BEGIN;

drop policy if exists "lecturer_profiles_insert_policy" on public.lecturer_profiles;

create policy "lecturer_profiles_insert_policy"
on public.lecturer_profiles for insert
to authenticated
with check (
  public.is_super_admin()
  or (
    user_id = auth.uid()
    and status = 'pending'
    and approved_by is null
    and approved_at is null
    and rejection_reason is null
  )
);

COMMIT;
