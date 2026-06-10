alter table public.pans_library
add column if not exists ingestion_worker_id uuid,
add column if not exists ingestion_worker_claimed_at timestamptz,
add column if not exists ingestion_worker_heartbeat_at timestamptz;

create index if not exists pans_library_ingestion_worker_id_idx
on public.pans_library(ingestion_worker_id);

alter table public.document_embeddings
add column if not exists ingestion_worker_id uuid;

create index if not exists document_embeddings_ingestion_worker_id_idx
on public.document_embeddings(ingestion_worker_id);

create or replace function public.claim_document_ingestion_worker(
  p_document_id uuid,
  p_ingestion_run_id uuid,
  p_worker_id uuid
)
returns table (
  document_id uuid,
  ingestion_run_id uuid,
  worker_id uuid,
  claimed boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_run_id uuid;
  v_worker_id uuid;
begin
  if p_document_id is null then
    raise exception 'document_id is required';
  end if;
  if p_ingestion_run_id is null then
    raise exception 'ingestion_run_id is required';
  end if;
  if p_worker_id is null then
    raise exception 'worker_id is required';
  end if;

  select pl.embedding_status, pl.ingestion_run_id, pl.ingestion_worker_id
  into v_status, v_run_id, v_worker_id
  from public.pans_library pl
  where pl.id = p_document_id
  for update;

  if not found or v_status <> 'processing' or v_run_id is distinct from p_ingestion_run_id then
    return query select p_document_id, p_ingestion_run_id, p_worker_id, false;
    return;
  end if;

  if v_worker_id is null or v_worker_id = p_worker_id then
    update public.pans_library pl
    set ingestion_worker_id = p_worker_id,
        ingestion_worker_claimed_at = coalesce(pl.ingestion_worker_claimed_at, now()),
        ingestion_worker_heartbeat_at = now(),
        last_updated_at = now()
    where pl.id = p_document_id;

    return query select p_document_id, p_ingestion_run_id, p_worker_id, true;
    return;
  end if;

  return query select p_document_id, p_ingestion_run_id, p_worker_id, false;
end;
$$;

revoke all on function public.claim_document_ingestion_worker(uuid, uuid, uuid) from public;
grant execute on function public.claim_document_ingestion_worker(uuid, uuid, uuid) to service_role;

create or replace function public.heartbeat_document_ingestion_worker(
  p_document_id uuid,
  p_ingestion_run_id uuid,
  p_worker_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.pans_library pl
  set ingestion_worker_heartbeat_at = now(),
      last_updated_at = now()
  where pl.id = p_document_id
    and pl.embedding_status = 'processing'
    and pl.ingestion_run_id = p_ingestion_run_id
    and pl.ingestion_worker_id = p_worker_id;

  return found;
end;
$$;

revoke all on function public.heartbeat_document_ingestion_worker(uuid, uuid, uuid) from public;
grant execute on function public.heartbeat_document_ingestion_worker(uuid, uuid, uuid) to service_role;

create or replace function public.prevent_stale_document_embedding_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_run_id uuid;
  v_current_worker_id uuid;
  v_embedding_status text;
begin
  if new.ingestion_run_id is null then
    raise exception 'ingestion_run_id is required for document embedding writes';
  end if;
  if new.ingestion_worker_id is null then
    raise exception 'ingestion_worker_id is required for document embedding writes';
  end if;

  select pl.ingestion_run_id, pl.ingestion_worker_id, pl.embedding_status
  into v_current_run_id, v_current_worker_id, v_embedding_status
  from public.pans_library pl
  where pl.id = new.document_id;

  if not found then
    raise exception 'Document not found for embedding write';
  end if;

  if v_embedding_status <> 'processing'
     or v_current_run_id is distinct from new.ingestion_run_id
     or v_current_worker_id is distinct from new.ingestion_worker_id then
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
    ingestion_worker_id = null,
    ingestion_worker_claimed_at = null,
    ingestion_worker_heartbeat_at = null,
    last_updated_at = now()
  where pl.id = p_document_id;

  return query select p_document_id, 'processing'::text, v_ingestion_run_id, true;
end;
$$;

revoke all on function public.claim_document_ingestion(uuid, boolean) from public;
grant execute on function public.claim_document_ingestion(uuid, boolean) to service_role;

create or replace function public.prepare_document_reembed(
  p_document_id uuid,
  p_allow_stale_processing_retry boolean default false
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
  v_heartbeat_at timestamptz;
  v_ingestion_run_id uuid := gen_random_uuid();
begin
  if p_document_id is null then
    raise exception 'document_id is required';
  end if;

  select pl.embedding_status, pl.ingestion_worker_heartbeat_at
  into v_embedding_status, v_heartbeat_at
  from public.pans_library pl
  where pl.id = p_document_id
  for update;

  if not found then
    raise exception 'Document not found';
  end if;

  if v_embedding_status = 'processing'
     and (
       not p_allow_stale_processing_retry
       or coalesce(v_heartbeat_at, now()) > now() - interval '15 minutes'
     ) then
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
    ingestion_worker_id = null,
    ingestion_worker_claimed_at = null,
    ingestion_worker_heartbeat_at = null,
    last_updated_at = now()
  where pl.id = p_document_id;

  return query select p_document_id, 'processing'::text, v_ingestion_run_id, true;
end;
$$;

revoke all on function public.prepare_document_reembed(uuid, boolean) from public;
grant execute on function public.prepare_document_reembed(uuid, boolean) to service_role;
