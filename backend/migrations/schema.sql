-- Canonical PansGPT schema as of March 2026. Keep this file in sync with all schema changes.

create extension if not exists pgcrypto;
create extension if not exists vector;

set check_function_bodies = off;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = 'super_admin'
  );
$$;

revoke all on function public.is_super_admin() from public;
grant execute on function public.is_super_admin() to authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  other_names text,
  full_name text,
  avatar_url text,
  university text,
  level text,
  subscription_tier text not null default 'free' check (subscription_tier in ('free', 'pro')),
  has_seen_welcome boolean not null default false,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

create index if not exists profiles_level_idx on public.profiles(level);
create index if not exists profiles_subscription_tier_idx on public.profiles(subscription_tier);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_policy" on public.profiles;
drop policy if exists "profiles_insert_policy" on public.profiles;
drop policy if exists "profiles_update_policy" on public.profiles;

create policy "profiles_select_policy"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_super_admin());

create policy "profiles_insert_policy"
on public.profiles for insert
to authenticated
with check (id = auth.uid() or public.is_super_admin());

create policy "profiles_update_policy"
on public.profiles for update
to authenticated
using (id = auth.uid() or public.is_super_admin())
with check (id = auth.uid() or public.is_super_admin());

create table if not exists public.user_roles (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  email text unique not null,
  role text not null check (role in ('admin', 'super_admin')),
  is_admin boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create unique index if not exists user_roles_user_id_uidx
on public.user_roles (user_id)
where user_id is not null;

alter table public.user_roles enable row level security;

drop policy if exists "user_roles_select_policy" on public.user_roles;
drop policy if exists "user_roles_insert_policy" on public.user_roles;
drop policy if exists "user_roles_update_policy" on public.user_roles;
drop policy if exists "user_roles_delete_policy" on public.user_roles;

create policy "user_roles_select_policy"
on public.user_roles for select
to authenticated
using (user_id = auth.uid() or public.is_super_admin());

create policy "user_roles_insert_policy"
on public.user_roles for insert
to authenticated
with check (public.is_super_admin());

create policy "user_roles_update_policy"
on public.user_roles for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "user_roles_delete_policy"
on public.user_roles for delete
to authenticated
using (public.is_super_admin());

create table if not exists public.system_settings (
  id integer primary key default 1,
  system_prompt text,
  temperature double precision not null default 0.7,
  maintenance_mode boolean not null default false,
  web_search_enabled boolean not null default true,
  rag_threshold double precision null default 0.50,
  total_api_calls bigint not null default 0,
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint check_temperature check (temperature >= 0.0 and temperature <= 1.0)
);

drop trigger if exists set_system_settings_updated_at on public.system_settings;
create trigger set_system_settings_updated_at
before update on public.system_settings
for each row execute function public.set_updated_at();

alter table public.system_settings enable row level security;

drop policy if exists "system_settings_select_policy" on public.system_settings;
drop policy if exists "system_settings_super_admin_policy" on public.system_settings;
drop policy if exists "system_settings_service_role_policy" on public.system_settings;

create policy "system_settings_select_policy"
on public.system_settings for select
to authenticated
using (true);

create policy "system_settings_super_admin_policy"
on public.system_settings for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "system_settings_service_role_policy"
on public.system_settings for all
to service_role
using (true)
with check (true);

insert into public.system_settings (id, system_prompt, temperature, maintenance_mode, web_search_enabled, total_api_calls)
values (1, 'You are PansGPT, an expert Pharmacy Tutor.', 0.7, false, true, 0)
on conflict (id) do nothing;

create table if not exists public.pans_library (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  course_code text not null,
  lecturer_name text not null,
  topic text not null,
  drive_file_id text not null unique,
  file_name text not null,
  file_size bigint not null default 0,
  uploaded_by_email text,
  target_levels text[] not null default '{}',
  embedding_status text not null default 'pending' check (embedding_status in ('pending', 'processing', 'completed', 'failed')),
  embedding_progress integer not null default 0 check (embedding_progress >= 0 and embedding_progress <= 100),
  total_chunks integer not null default 0 check (total_chunks >= 0),
  embedding_error text,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

create index if not exists pans_library_created_at_idx on public.pans_library(created_at desc);
create index if not exists pans_library_course_code_idx on public.pans_library(course_code);
create index if not exists pans_library_drive_file_id_idx on public.pans_library(drive_file_id);
create index if not exists idx_pans_library_target_levels on public.pans_library using gin (target_levels);

comment on column public.pans_library.target_levels is
  'Academic levels this document is visible to, e.g. {400lvl,500lvl}. Empty/null = visible to all.';

drop trigger if exists set_pans_library_updated_at on public.pans_library;
create trigger set_pans_library_updated_at
before update on public.pans_library
for each row execute function public.set_updated_at();

alter table public.pans_library enable row level security;

drop policy if exists "pans_library_select_policy" on public.pans_library;
drop policy if exists "pans_library_super_admin_policy" on public.pans_library;
drop policy if exists "pans_library_service_role_policy" on public.pans_library;

create policy "pans_library_select_policy"
on public.pans_library for select
to authenticated
using (true);

create policy "pans_library_super_admin_policy"
on public.pans_library for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "pans_library_service_role_policy"
on public.pans_library for all
to service_role
using (true)
with check (true);

create table if not exists public.document_embeddings (
  id bigserial primary key,
  document_id uuid not null references public.pans_library(id) on delete cascade,
  content text not null,
  embedding vector(768) not null,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

create index if not exists document_embeddings_document_id_idx on public.document_embeddings(document_id);
create index if not exists document_embeddings_embedding_idx
on public.document_embeddings
using ivfflat (embedding vector_cosine_ops)
with (lists = 100);

alter table public.document_embeddings enable row level security;

drop policy if exists "document_embeddings_service_role_policy" on public.document_embeddings;
create policy "document_embeddings_service_role_policy"
on public.document_embeddings for all
to service_role
using (true)
with check (true);

create or replace function public.match_documents(
  query_embedding vector(768),
  match_threshold double precision,
  match_count integer,
  filter_doc_id uuid
)
returns table (
  id bigint,
  document_id uuid,
  content text,
  similarity double precision
)
language sql
security definer
set search_path = public
as $$
  select
    de.id,
    de.document_id,
    de.content,
    1 - (de.embedding <=> query_embedding) as similarity
  from public.document_embeddings de
  where de.document_id = filter_doc_id
    and 1 - (de.embedding <=> query_embedding) >= match_threshold
  order by de.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

create or replace function public.match_documents_global(
  query_embedding vector(768),
  match_threshold double precision,
  match_count integer,
  allowed_doc_ids uuid[]
)
returns table (
  id bigint,
  document_id uuid,
  content text,
  similarity double precision
)
language sql
security definer
set search_path = public
as $$
  select
    de.id,
    de.document_id,
    de.content,
    1 - (de.embedding <=> query_embedding) as similarity
  from public.document_embeddings de
  where de.document_id = any(allowed_doc_ids)
    and 1 - (de.embedding <=> query_embedding) >= match_threshold
  order by de.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

revoke all on function public.match_documents(vector, double precision, integer, uuid) from public;
revoke all on function public.match_documents_global(vector, double precision, integer, uuid[]) from public;
grant execute on function public.match_documents(vector, double precision, integer, uuid) to authenticated, service_role;
grant execute on function public.match_documents_global(vector, double precision, integer, uuid[]) to authenticated, service_role;

create table if not exists public.document_notes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.pans_library(id) on delete cascade,
  image_base64 text not null default '',
  ai_explanation text,
  category text default 'Key Point' check (category in ('Definition', 'Key Point', 'Formula', 'Important')),
  page_number integer,
  user_annotation text,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

create index if not exists document_notes_user_document_idx on public.document_notes(user_id, document_id, created_at);
create index if not exists document_notes_document_idx on public.document_notes(document_id);

alter table public.document_notes enable row level security;

drop policy if exists "document_notes_select_policy" on public.document_notes;
drop policy if exists "document_notes_insert_policy" on public.document_notes;
drop policy if exists "document_notes_update_policy" on public.document_notes;
drop policy if exists "document_notes_delete_policy" on public.document_notes;
drop policy if exists "document_notes_service_role_policy" on public.document_notes;

create policy "document_notes_select_policy"
on public.document_notes for select
to authenticated
using (user_id = auth.uid() or public.is_super_admin());

create policy "document_notes_insert_policy"
on public.document_notes for insert
to authenticated
with check (user_id = auth.uid() or public.is_super_admin());

create policy "document_notes_update_policy"
on public.document_notes for update
to authenticated
using (user_id = auth.uid() or public.is_super_admin())
with check (user_id = auth.uid() or public.is_super_admin());

create policy "document_notes_delete_policy"
on public.document_notes for delete
to authenticated
using (user_id = auth.uid() or public.is_super_admin());

create policy "document_notes_service_role_policy"
on public.document_notes for all
to service_role
using (true)
with check (true);

create table if not exists public.chat_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New Chat',
  summary text,
  context_id text,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

create index if not exists chat_sessions_user_updated_idx on public.chat_sessions(user_id, updated_at desc);
create index if not exists chat_sessions_context_idx on public.chat_sessions(context_id);

drop trigger if exists set_chat_sessions_updated_at on public.chat_sessions;
create trigger set_chat_sessions_updated_at
before update on public.chat_sessions
for each row execute function public.set_updated_at();

alter table public.chat_sessions enable row level security;

drop policy if exists "chat_sessions_select_policy" on public.chat_sessions;
drop policy if exists "chat_sessions_insert_policy" on public.chat_sessions;
drop policy if exists "chat_sessions_update_policy" on public.chat_sessions;
drop policy if exists "chat_sessions_delete_policy" on public.chat_sessions;
drop policy if exists "chat_sessions_service_role_policy" on public.chat_sessions;

create policy "chat_sessions_select_policy"
on public.chat_sessions for select
to authenticated
using (user_id = auth.uid() or public.is_super_admin());

create policy "chat_sessions_insert_policy"
on public.chat_sessions for insert
to authenticated
with check (user_id = auth.uid() or public.is_super_admin());

create policy "chat_sessions_update_policy"
on public.chat_sessions for update
to authenticated
using (user_id = auth.uid() or public.is_super_admin())
with check (user_id = auth.uid() or public.is_super_admin());

create policy "chat_sessions_delete_policy"
on public.chat_sessions for delete
to authenticated
using (user_id = auth.uid() or public.is_super_admin());

create policy "chat_sessions_service_role_policy"
on public.chat_sessions for all
to service_role
using (true)
with check (true);

create table if not exists public.chat_messages (
  id bigserial primary key,
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'ai', 'system')),
  content text not null,
  image_data text,
  citations jsonb,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

create index if not exists chat_messages_session_created_idx on public.chat_messages(session_id, created_at);
create index if not exists chat_messages_role_idx on public.chat_messages(role);

alter table public.chat_messages enable row level security;

drop policy if exists "chat_messages_select_policy" on public.chat_messages;
drop policy if exists "chat_messages_insert_policy" on public.chat_messages;
drop policy if exists "chat_messages_update_policy" on public.chat_messages;
drop policy if exists "chat_messages_delete_policy" on public.chat_messages;
drop policy if exists "chat_messages_service_role_policy" on public.chat_messages;

create policy "chat_messages_select_policy"
on public.chat_messages for select
to authenticated
using (
  exists (
    select 1
    from public.chat_sessions cs
    where cs.id = chat_messages.session_id
      and (cs.user_id = auth.uid() or public.is_super_admin())
  )
);

create policy "chat_messages_insert_policy"
on public.chat_messages for insert
to authenticated
with check (
  exists (
    select 1
    from public.chat_sessions cs
    where cs.id = chat_messages.session_id
      and (cs.user_id = auth.uid() or public.is_super_admin())
  )
);

create policy "chat_messages_update_policy"
on public.chat_messages for update
to authenticated
using (
  exists (
    select 1
    from public.chat_sessions cs
    where cs.id = chat_messages.session_id
      and (cs.user_id = auth.uid() or public.is_super_admin())
  )
)
with check (
  exists (
    select 1
    from public.chat_sessions cs
    where cs.id = chat_messages.session_id
      and (cs.user_id = auth.uid() or public.is_super_admin())
  )
);

create policy "chat_messages_delete_policy"
on public.chat_messages for delete
to authenticated
using (
  exists (
    select 1
    from public.chat_sessions cs
    where cs.id = chat_messages.session_id
      and (cs.user_id = auth.uid() or public.is_super_admin())
  )
);

create policy "chat_messages_service_role_policy"
on public.chat_messages for all
to service_role
using (true)
with check (true);

create table if not exists public.message_feedback (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.chat_sessions(id) on delete set null,
  message_id bigint references public.chat_messages(id) on delete set null,
  rating text not null check (rating in ('up', 'down', 'report')),
  category text,
  comments text,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

create index if not exists message_feedback_user_idx on public.message_feedback(user_id, created_at desc);
create index if not exists message_feedback_session_idx on public.message_feedback(session_id);

alter table public.message_feedback enable row level security;

drop policy if exists "message_feedback_select_policy" on public.message_feedback;
drop policy if exists "message_feedback_insert_policy" on public.message_feedback;
drop policy if exists "message_feedback_service_role_policy" on public.message_feedback;

create policy "message_feedback_select_policy"
on public.message_feedback for select
to authenticated
using (user_id = auth.uid() or public.is_super_admin());

create policy "message_feedback_insert_policy"
on public.message_feedback for insert
to authenticated
with check (user_id = auth.uid() or public.is_super_admin());

create policy "message_feedback_service_role_policy"
on public.message_feedback for all
to service_role
using (true)
with check (true);

create table if not exists public.faculty_knowledge (
  id uuid default gen_random_uuid() primary key,
  level text not null,
  knowledge_text text not null,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

create index if not exists faculty_knowledge_level_idx on public.faculty_knowledge(level);

drop trigger if exists set_faculty_knowledge_updated_at on public.faculty_knowledge;
create trigger set_faculty_knowledge_updated_at
before update on public.faculty_knowledge
for each row execute function public.set_updated_at();

alter table public.faculty_knowledge enable row level security;

drop policy if exists "faculty_knowledge_select_policy" on public.faculty_knowledge;
drop policy if exists "faculty_knowledge_super_admin_policy" on public.faculty_knowledge;
drop policy if exists "faculty_knowledge_service_role_policy" on public.faculty_knowledge;

create policy "faculty_knowledge_select_policy"
on public.faculty_knowledge for select
to authenticated
using (true);

create policy "faculty_knowledge_super_admin_policy"
on public.faculty_knowledge for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "faculty_knowledge_service_role_policy"
on public.faculty_knowledge for all
to service_role
using (true)
with check (true);

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

drop trigger if exists set_quizzes_updated_at on public.quizzes;
create trigger set_quizzes_updated_at
before update on public.quizzes
for each row execute function public.set_updated_at();

alter table public.quizzes enable row level security;

drop policy if exists "Users can view own quizzes" on public.quizzes;
drop policy if exists "Users can insert own quizzes" on public.quizzes;
drop policy if exists "Users can update own quizzes" on public.quizzes;
drop policy if exists "Service role full access to quizzes" on public.quizzes;

create policy "Users can view own quizzes"
  on public.quizzes for select to authenticated
  using (user_id = auth.uid());

create policy "Users can insert own quizzes"
  on public.quizzes for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users can update own quizzes"
  on public.quizzes for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Service role full access to quizzes"
  on public.quizzes for all to service_role
  using (true) with check (true);

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

drop policy if exists "Users can view questions of own quizzes" on public.quiz_questions;
drop policy if exists "Users can insert questions for own quizzes" on public.quiz_questions;
drop policy if exists "Service role full access to quiz_questions" on public.quiz_questions;

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

create policy "Service role full access to quiz_questions"
  on public.quiz_questions for all to service_role
  using (true) with check (true);

create table if not exists public.quiz_results (
  id uuid default gen_random_uuid() primary key,
  quiz_id uuid references public.quizzes(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  answers jsonb not null,
  score double precision not null,
  max_score double precision not null,
  percentage double precision not null,
  time_taken integer,
  feedback jsonb,
  completed_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists quiz_results_quiz_id_idx on public.quiz_results(quiz_id);
create index if not exists quiz_results_user_id_idx on public.quiz_results(user_id);
create index if not exists quiz_results_completed_at_idx on public.quiz_results(completed_at desc);

alter table public.quiz_results enable row level security;

drop policy if exists "Users can view own quiz results" on public.quiz_results;
drop policy if exists "Users can insert own quiz results" on public.quiz_results;
drop policy if exists "Service role full access to quiz_results" on public.quiz_results;

create policy "Users can view own quiz results"
  on public.quiz_results for select to authenticated
  using (user_id = auth.uid());

create policy "Users can insert own quiz results"
  on public.quiz_results for insert to authenticated
  with check (user_id = auth.uid());

create policy "Service role full access to quiz_results"
  on public.quiz_results for all to service_role
  using (true) with check (true);

create table if not exists public.timetables (
  id uuid default gen_random_uuid() primary key,
  level text not null,
  day text not null,
  time_slot text not null,
  start_time text,
  course_code text not null,
  course_title text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(level, day, time_slot, course_code)
);

create index if not exists timetables_level_day_idx on public.timetables(level, day);
create index if not exists timetables_start_time_idx on public.timetables(start_time);

drop trigger if exists set_timetables_updated_at on public.timetables;
create trigger set_timetables_updated_at
before update on public.timetables
for each row execute function public.set_updated_at();

alter table public.timetables enable row level security;

drop policy if exists "Authenticated users can view timetables" on public.timetables;
drop policy if exists "Service role full access to timetables" on public.timetables;
drop policy if exists "Super admin full access to timetables" on public.timetables;

create policy "Authenticated users can view timetables"
  on public.timetables for select to authenticated
  using (true);

create policy "Super admin full access to timetables"
  on public.timetables for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "Service role full access to timetables"
  on public.timetables for all to service_role
  using (true) with check (true);

create table if not exists public.document_progress (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id text not null,
  current_page integer not null default 1 check (current_page >= 1),
  total_pages integer not null default 1 check (total_pages >= 1),
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint document_progress_user_doc_unique unique (user_id, document_id)
);

create or replace function public.update_document_progress_timestamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists set_document_progress_updated_at on public.document_progress;
create trigger set_document_progress_updated_at
before update on public.document_progress
for each row execute function public.update_document_progress_timestamp();

alter table public.document_progress enable row level security;

drop policy if exists "document_progress_select_policy" on public.document_progress;
drop policy if exists "document_progress_insert_policy" on public.document_progress;
drop policy if exists "document_progress_update_policy" on public.document_progress;
drop policy if exists "document_progress_delete_policy" on public.document_progress;

create policy "document_progress_select_policy"
on public.document_progress for select
to authenticated
using (user_id = auth.uid());

create policy "document_progress_insert_policy"
on public.document_progress for insert
to authenticated
with check (user_id = auth.uid());

create policy "document_progress_update_policy"
on public.document_progress for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "document_progress_delete_policy"
on public.document_progress for delete
to authenticated
using (user_id = auth.uid());

create table if not exists public.web_search_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  count integer not null default 0 check (count >= 0),
  primary key (user_id, date)
);

create or replace function public.increment_web_search_usage(p_user_id uuid, p_date date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  insert into public.web_search_usage as wsu (user_id, date, count)
  values (p_user_id, p_date, 1)
  on conflict (user_id, date)
  do update set count = wsu.count + 1
  returning count into new_count;

  return new_count;
end;
$$;

revoke all on function public.increment_web_search_usage(uuid, date) from public;
grant execute on function public.increment_web_search_usage(uuid, date) to service_role;

alter table public.web_search_usage enable row level security;

drop policy if exists "web_search_usage_select_own" on public.web_search_usage;
drop policy if exists "web_search_usage_service_role_insert" on public.web_search_usage;
drop policy if exists "web_search_usage_service_role_update" on public.web_search_usage;
drop policy if exists "web_search_usage_service_role_delete" on public.web_search_usage;

create policy "web_search_usage_select_own"
on public.web_search_usage for select
to authenticated
using (user_id = auth.uid());

create policy "web_search_usage_service_role_insert"
on public.web_search_usage for insert
to service_role
with check (true);

create policy "web_search_usage_service_role_update"
on public.web_search_usage for update
to service_role
using (true)
with check (true);

create policy "web_search_usage_service_role_delete"
on public.web_search_usage for delete
to service_role
using (true);
