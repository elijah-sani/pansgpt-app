-- PansGPT Integration: Quiz and Timetable tables
-- Run this in your Supabase SQL Editor
-- NOTE: conversations, messages, and message_feedback already exist
-- in Supabase as chat_sessions, chat_messages, and message_feedback

-- ============================================
-- 4. QUIZZES TABLE
-- ============================================
create table if not exists public.quizzes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  course_code text not null,
  course_title text not null,
  topic text,
  level text not null,
  difficulty text not null default 'medium',
  num_questions integer not null,
  time_limit integer,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists quizzes_user_id_idx on public.quizzes(user_id);
create index if not exists quizzes_course_code_idx on public.quizzes(course_code);
create index if not exists quizzes_level_idx on public.quizzes(level);
create index if not exists quizzes_created_at_idx on public.quizzes(created_at desc);

alter table public.quizzes enable row level security;

create policy "Users can view own quizzes"
  on public.quizzes for select to authenticated
  using (user_id = auth.uid());

create policy "Users can insert own quizzes"
  on public.quizzes for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users can update own quizzes"
  on public.quizzes for update to authenticated
  using (user_id = auth.uid());

-- Service role can read all quizzes (for admin/share)
create policy "Service role full access to quizzes"
  on public.quizzes for all to service_role
  using (true) with check (true);

-- ============================================
-- 5. QUIZ QUESTIONS TABLE
-- ============================================
create table if not exists public.quiz_questions (
  id uuid default gen_random_uuid() primary key,
  quiz_id uuid references public.quizzes(id) on delete cascade not null,
  question_text text not null,
  question_type text not null,
  options jsonb,
  correct_answer text not null,
  explanation text,
  points integer not null default 1,
  question_order integer not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists quiz_questions_quiz_id_idx on public.quiz_questions(quiz_id);
create index if not exists quiz_questions_order_idx on public.quiz_questions(question_order);

alter table public.quiz_questions enable row level security;

create policy "Users can view questions of own quizzes"
  on public.quiz_questions for select to authenticated
  using (
    exists (
      select 1 from public.quizzes q
      where q.id = quiz_id and q.user_id = auth.uid()
    )
  );

create policy "Users can insert questions for own quizzes"
  on public.quiz_questions for insert to authenticated
  with check (
    exists (
      select 1 from public.quizzes q
      where q.id = quiz_id and q.user_id = auth.uid()
    )
  );

-- Service role for admin/share
create policy "Service role full access to quiz_questions"
  on public.quiz_questions for all to service_role
  using (true) with check (true);

-- ============================================
-- 6. QUIZ RESULTS TABLE
-- ============================================
create table if not exists public.quiz_results (
  id uuid default gen_random_uuid() primary key,
  quiz_id uuid references public.quizzes(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  answers jsonb not null,
  score float not null,
  max_score float not null,
  percentage float not null,
  time_taken integer,
  feedback jsonb,
  completed_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists quiz_results_quiz_id_idx on public.quiz_results(quiz_id);
create index if not exists quiz_results_user_id_idx on public.quiz_results(user_id);
create index if not exists quiz_results_completed_at_idx on public.quiz_results(completed_at desc);

alter table public.quiz_results enable row level security;

create policy "Users can view own quiz results"
  on public.quiz_results for select to authenticated
  using (user_id = auth.uid());

create policy "Users can insert own quiz results"
  on public.quiz_results for insert to authenticated
  with check (user_id = auth.uid());

-- Service role for admin
create policy "Service role full access to quiz_results"
  on public.quiz_results for all to service_role
  using (true) with check (true);

-- ============================================
-- 7. TIMETABLES TABLE
-- ============================================
create table if not exists public.timetables (
  id uuid default gen_random_uuid() primary key,
  level text not null,
  day text not null,
  time_slot text not null,
  course_code text not null,
  course_title text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(level, day, time_slot)
);

alter table public.timetables enable row level security;

create policy "Authenticated users can view timetables"
  on public.timetables for select to authenticated
  using (true);

-- Service role for admin management
create policy "Service role full access to timetables"
  on public.timetables for all to service_role
  using (true) with check (true);
