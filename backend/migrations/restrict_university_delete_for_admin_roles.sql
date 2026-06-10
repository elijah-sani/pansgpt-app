-- Migration to restrict university deletion if active admin roles are linked.
-- Do not run automatically.

BEGIN;

ALTER TABLE public.user_roles
DROP CONSTRAINT IF EXISTS user_roles_university_id_fkey;

ALTER TABLE public.user_roles
ADD CONSTRAINT user_roles_university_id_fkey
FOREIGN KEY (university_id)
REFERENCES public.universities(id)
ON DELETE RESTRICT;

COMMIT;
