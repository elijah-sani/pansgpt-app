-- Migration to update university lifecycle status constraint.
-- Do not run automatically.

BEGIN;

-- 1. Map any legacy inactive statuses to suspended
UPDATE public.universities
SET status = 'suspended'
WHERE status = 'inactive';

-- 2. Drop the old constraint
ALTER TABLE public.universities
DROP CONSTRAINT IF EXISTS universities_status_check;

-- 3. Add the new constraint
ALTER TABLE public.universities
ADD CONSTRAINT universities_status_check
CHECK (status IN ('active', 'suspended'));

COMMIT;
