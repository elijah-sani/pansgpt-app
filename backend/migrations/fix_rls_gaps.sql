-- 🔴 URGENT: Re-enable RLS on tables where policies already exist but got disabled
alter table public.chat_messages enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.document_embeddings enable row level security;
alter table public.faculty_knowledge enable row level security;

-- 🔴 URGENT: activity_logs and vector_index_metadata never had policies — lock to backend-only
alter table public.activity_logs enable row level security;
alter table public.vector_index_metadata enable row level security;

revoke all on public.activity_logs from anon, authenticated;
grant all on public.activity_logs to service_role;

revoke all on public.vector_index_metadata from anon, authenticated;
grant all on public.vector_index_metadata to service_role;
