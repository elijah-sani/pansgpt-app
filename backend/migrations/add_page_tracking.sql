-- Migration: Add page tracking to document embeddings
-- [PAGE TRACKING]

alter table public.document_embeddings
add column if not exists page_start integer,
add column if not exists page_end integer;
