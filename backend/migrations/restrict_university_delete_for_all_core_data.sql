-- Migration to update foreign key constraints to ON DELETE RESTRICT for core university-owned tables.
-- Do not run automatically.

BEGIN;

-- 1. profiles.university_id
ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_university_id_fkey;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_university_id_fkey
FOREIGN KEY (university_id)
REFERENCES public.universities(id)
ON DELETE RESTRICT;

-- 2. academic_contexts.university_id
ALTER TABLE public.academic_contexts
DROP CONSTRAINT IF EXISTS academic_contexts_university_id_fkey;

ALTER TABLE public.academic_contexts
ADD CONSTRAINT academic_contexts_university_id_fkey
FOREIGN KEY (university_id)
REFERENCES public.universities(id)
ON DELETE RESTRICT;

-- 3. pans_library.university_id
ALTER TABLE public.pans_library
DROP CONSTRAINT IF EXISTS pans_library_university_id_fkey;

ALTER TABLE public.pans_library
ADD CONSTRAINT pans_library_university_id_fkey
FOREIGN KEY (university_id)
REFERENCES public.universities(id)
ON DELETE RESTRICT;

-- 4. faculty_knowledge.university_id
ALTER TABLE public.faculty_knowledge
DROP CONSTRAINT IF EXISTS faculty_knowledge_university_id_fkey;

ALTER TABLE public.faculty_knowledge
ADD CONSTRAINT faculty_knowledge_university_id_fkey
FOREIGN KEY (university_id)
REFERENCES public.universities(id)
ON DELETE RESTRICT;

-- 5. timetables.university_id
ALTER TABLE public.timetables
DROP CONSTRAINT IF EXISTS timetables_university_id_fkey;

ALTER TABLE public.timetables
ADD CONSTRAINT timetables_university_id_fkey
FOREIGN KEY (university_id)
REFERENCES public.universities(id)
ON DELETE RESTRICT;

COMMIT;
