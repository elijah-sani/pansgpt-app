-- FILE: backend/migrations/migrate_annotations_to_content.sql
BEGIN;

UPDATE public.document_notes
SET content = jsonb_build_array(
  jsonb_build_object(
    'type', 'paragraph',
    'content', jsonb_build_array(
      jsonb_build_object(
        'type', 'text',
        'text', user_annotation,
        'styles', jsonb_build_object()
      )
    )
  )
)
WHERE user_annotation IS NOT NULL AND content IS NULL;

COMMIT;
