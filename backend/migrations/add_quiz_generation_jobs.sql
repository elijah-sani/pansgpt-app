create table if not exists public.quiz_generation_jobs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  request_payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'retrieving', 'generating', 'saving', 'completed', 'failed', 'cancelled')),
  progress integer not null default 0 check (progress >= 0 and progress <= 100),
  current_step text,
  error_message text,
  quiz_id uuid references public.quizzes(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  completed_at timestamp with time zone
);

create index if not exists quiz_generation_jobs_user_id_idx
on public.quiz_generation_jobs(user_id);

create index if not exists quiz_generation_jobs_status_idx
on public.quiz_generation_jobs(status);

create index if not exists quiz_generation_jobs_created_at_idx
on public.quiz_generation_jobs(created_at desc);

drop trigger if exists set_quiz_generation_jobs_updated_at on public.quiz_generation_jobs;
create trigger set_quiz_generation_jobs_updated_at
before update on public.quiz_generation_jobs
for each row execute function public.set_updated_at();

alter table public.quiz_generation_jobs enable row level security;

drop policy if exists "Users can view own quiz generation jobs" on public.quiz_generation_jobs;
drop policy if exists "Users can insert own quiz generation jobs" on public.quiz_generation_jobs;
drop policy if exists "Service role full access to quiz_generation_jobs" on public.quiz_generation_jobs;

create policy "Users can view own quiz generation jobs"
  on public.quiz_generation_jobs for select to authenticated
  using (user_id = auth.uid());

create policy "Users can insert own quiz generation jobs"
  on public.quiz_generation_jobs for insert to authenticated
  with check (user_id = auth.uid());

create policy "Service role full access to quiz_generation_jobs"
  on public.quiz_generation_jobs for all to service_role
  using (true) with check (true);
