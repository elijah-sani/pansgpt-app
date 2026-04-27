-- FILE: backend/migrations/add_notes_v2_fields.sql
BEGIN;

-- Safely add new columns
ALTER TABLE public.document_notes
ADD COLUMN IF NOT EXISTS title text,
ADD COLUMN IF NOT EXISTS content jsonb,
ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
ADD COLUMN IF NOT EXISTS last_edited_at timestamptz NOT NULL DEFAULT now();

-- Safely drop the NOT NULL constraint on document_id
ALTER TABLE public.document_notes
ALTER COLUMN document_id DROP NOT NULL;

-- Safely add new indexes
CREATE INDEX IF NOT EXISTS idx_document_notes_tags ON public.document_notes USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_document_notes_user_id ON public.document_notes(user_id);

COMMIT;
