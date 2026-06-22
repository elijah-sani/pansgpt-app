alter table public.quiz_generation_jobs
  add column if not exists generated_question_count integer not null default 0;

alter table public.quiz_generation_jobs
  add column if not exists target_question_count integer not null default 0;

