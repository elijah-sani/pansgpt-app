alter table public.timetables
add column if not exists university_id uuid references public.universities(id) on delete set null;

create index if not exists timetables_university_id_idx
on public.timetables (university_id);

alter table public.timetables
drop constraint if exists timetables_level_day_time_slot_course_code_key;

alter table public.timetables
add constraint timetables_university_level_day_slot_course_key
unique (university_id, level, day, time_slot, course_code);

alter table public.faculty_knowledge
add column if not exists university_id uuid references public.universities(id) on delete set null;

create index if not exists faculty_knowledge_university_id_idx
on public.faculty_knowledge (university_id);
