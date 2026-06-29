alter table public.lecturer_material_submissions
add column if not exists resubmitted_from_id uuid null
references public.lecturer_material_submissions(id)
on delete restrict;

create index if not exists lecturer_material_submissions_resubmitted_from_id_idx
on public.lecturer_material_submissions (resubmitted_from_id);

create unique index if not exists lecturer_material_submissions_one_resubmission_per_rejection_idx
on public.lecturer_material_submissions (resubmitted_from_id)
where resubmitted_from_id is not null;
