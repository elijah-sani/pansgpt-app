alter table public.pans_library
add column if not exists failed_chunks_count integer not null default 0 check (failed_chunks_count >= 0),
add column if not exists error_log text,
add column if not exists last_updated_at timestamp with time zone,
add column if not exists ingestion_run_id uuid,
add column if not exists ingestion_worker_id uuid,
add column if not exists ingestion_worker_claimed_at timestamptz,
add column if not exists ingestion_worker_heartbeat_at timestamptz;

create index if not exists pans_library_ingestion_run_id_idx
on public.pans_library(ingestion_run_id);

create index if not exists pans_library_ingestion_worker_id_idx
on public.pans_library(ingestion_worker_id);

alter table public.document_embeddings
add column if not exists ingestion_run_id uuid,
add column if not exists ingestion_worker_id uuid;

create index if not exists document_embeddings_ingestion_run_id_idx
on public.document_embeddings(ingestion_run_id);

create index if not exists document_embeddings_ingestion_worker_id_idx
on public.document_embeddings(ingestion_worker_id);

create or replace function public.prevent_stale_document_embedding_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_run_id uuid;
  v_embedding_status text;
begin
  if new.ingestion_run_id is null then
    raise exception 'ingestion_run_id is required for document embedding writes';
  end if;

  select pl.ingestion_run_id, pl.embedding_status
  into v_current_run_id, v_embedding_status
  from public.pans_library pl
  where pl.id = new.document_id;

  if not found then
    raise exception 'Document not found for embedding write';
  end if;

  if v_embedding_status <> 'processing' or v_current_run_id is distinct from new.ingestion_run_id then
    raise exception 'Stale ingestion worker cannot write embeddings for this document';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_stale_document_embedding_write_trigger on public.document_embeddings;
create trigger prevent_stale_document_embedding_write_trigger
before insert or update on public.document_embeddings
for each row execute function public.prevent_stale_document_embedding_write();

create or replace function public.claim_document_ingestion(
  p_document_id uuid,
  p_delete_existing_embeddings boolean default false
)
returns table (
  document_id uuid,
  embedding_status text,
  ingestion_run_id uuid,
  should_queue_ingestion boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_embedding_status text;
  v_ingestion_run_id uuid := gen_random_uuid();
begin
  if p_document_id is null then
    raise exception 'document_id is required';
  end if;

  select pl.embedding_status
  into v_embedding_status
  from public.pans_library pl
  where pl.id = p_document_id
  for update;

  if not found then
    raise exception 'Document not found';
  end if;

  if v_embedding_status = 'processing' then
    raise exception 'This document is already being processed. Wait for the current ingestion to finish before retrying.';
  end if;

  if p_delete_existing_embeddings then
    delete from public.document_embeddings de
    where de.document_id = p_document_id;
  end if;

  update public.pans_library pl
  set
    embedding_status = 'processing',
    embedding_progress = 0,
    total_chunks = 0,
    embedding_error = null,
    failed_chunks_count = 0,
    error_log = null,
    ingestion_run_id = v_ingestion_run_id,
    last_updated_at = now()
  where pl.id = p_document_id;

  return query
  select
    p_document_id,
    'processing'::text,
    v_ingestion_run_id,
    true;
end;
$$;

revoke all on function public.claim_document_ingestion(uuid, boolean) from public;
grant execute on function public.claim_document_ingestion(uuid, boolean) to service_role;

create or replace function public.prepare_document_reembed(
  p_document_id uuid
)
returns table (
  document_id uuid,
  embedding_status text,
  ingestion_run_id uuid,
  should_queue_ingestion boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_embedding_status text;
  v_ingestion_run_id uuid := gen_random_uuid();
begin
  if p_document_id is null then
    raise exception 'document_id is required';
  end if;

  select pl.embedding_status
  into v_embedding_status
  from public.pans_library pl
  where pl.id = p_document_id
  for update;

  if not found then
    raise exception 'Document not found';
  end if;

  if v_embedding_status = 'processing' then
    raise exception 'This document is already being processed. Wait for the current ingestion to finish before retrying.';
  end if;

  delete from public.document_embeddings de
  where de.document_id = p_document_id;

  update public.pans_library pl
  set
    embedding_status = 'processing',
    embedding_progress = 0,
    total_chunks = 0,
    embedding_error = null,
    failed_chunks_count = 0,
    error_log = null,
    ingestion_run_id = v_ingestion_run_id,
    last_updated_at = now()
  where pl.id = p_document_id;

  return query
  select
    p_document_id,
    'processing'::text,
    v_ingestion_run_id,
    true;
end;
$$;

revoke all on function public.prepare_document_reembed(uuid) from public;
grant execute on function public.prepare_document_reembed(uuid) to service_role;
