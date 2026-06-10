-- Migration to enforce the two-role admin model with senior/standard levels.
-- Do not run automatically.

BEGIN;

-- ============================================================================
-- Step A: Initial preflight before schema changes
-- ============================================================================
DO $$
BEGIN
    -- 1. Unsupported roles check
    IF EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE role NOT IN ('super_admin', 'university_admin', 'global_admin', 'admin')
    ) THEN
        RAISE EXCEPTION 'Preflight failed: Found invalid roles outside allowed values';
    END IF;

    -- 2. super_admin with non-null university_id
    IF EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE role = 'super_admin' AND university_id IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'Preflight failed: Found super_admin with non-null university_id';
    END IF;

    -- 3. university_admin with null university_id
    IF EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE role = 'university_admin' AND university_id IS NULL
    ) THEN
        RAISE EXCEPTION 'Preflight failed: Found university_admin with NULL university_id';
    END IF;

    -- 4. Duplicate non-null user_id rows
    IF EXISTS (
        SELECT user_id FROM public.user_roles 
        WHERE user_id IS NOT NULL 
        GROUP BY user_id HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Preflight failed: Duplicate user_id rows found';
    END IF;

    -- 5. Duplicate emails (case-insensitive)
    IF EXISTS (
        SELECT lower(email) FROM public.user_roles 
        GROUP BY lower(email) HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Preflight failed: Duplicate emails found';
    END IF;
END $$;

-- ============================================================================
-- Step B: Add column
-- ============================================================================
ALTER TABLE public.user_roles
ADD COLUMN IF NOT EXISTS admin_level text NULL;

-- ============================================================================
-- Step C: Backfill approved live row
-- ============================================================================
-- Backfill annydangwam@gmail.com to university_admin role and senior admin_level
UPDATE public.user_roles
SET role = 'university_admin',
    admin_level = 'senior'
WHERE lower(trim(email)) = 'annydangwam@gmail.com';

-- ============================================================================
-- Step D: Second preflight after backfill
-- ============================================================================
DO $$
BEGIN
    -- 1. Ensure no super_admin has non-null admin_level
    IF EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE role = 'super_admin' AND admin_level IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'Preflight failed: Found super_admin with non-null admin_level';
    END IF;

    -- 2. Ensure no university_admin has null admin_level
    IF EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE role = 'university_admin' AND admin_level IS NULL
    ) THEN
        RAISE EXCEPTION 'Preflight failed: Found university_admin with NULL admin_level after backfill';
    END IF;

    -- 3. Ensure no university_admin has invalid admin_level
    IF EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE role = 'university_admin' AND admin_level NOT IN ('senior', 'standard')
    ) THEN
        RAISE EXCEPTION 'Preflight failed: Found university_admin with invalid admin_level';
    END IF;
END $$;

-- ============================================================================
-- Step E: Replace constraints
-- ============================================================================
-- Drop old role check constraint if it exists
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;

-- Add new role check constraint
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('super_admin', 'university_admin'));

-- Add new scope check constraint
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_role_scope_check
  CHECK (
    (
      role = 'super_admin'
      AND university_id IS NULL
      AND admin_level IS NULL
    )
    OR
    (
      role = 'university_admin'
      AND university_id IS NOT NULL
      AND admin_level IN ('senior', 'standard')
    )
  );

-- ============================================================================
-- RPC: claim_pending_admin_access
-- ============================================================================
CREATE OR REPLACE FUNCTION public.claim_pending_admin_access(
  p_email text,
  p_user_id uuid
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  email text,
  role text,
  is_admin boolean,
  university_id uuid,
  admin_level text,
  created_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_row public.user_roles%rowtype;
BEGIN
  v_email := lower(trim(p_email));

  -- Lock the matching row
  SELECT * INTO v_row
  FROM public.user_roles
  WHERE lower(email) = v_email
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_row.user_id IS NULL THEN
    -- Bind the user_id
    UPDATE public.user_roles ur
    SET user_id = p_user_id
    WHERE ur.id = v_row.id
    RETURNING * INTO v_row;
    
    RETURN QUERY SELECT 
      v_row.id, v_row.user_id, v_row.email, v_row.role, 
      v_row.is_admin, v_row.university_id, v_row.admin_level, v_row.created_at;
  ELSIF v_row.user_id = p_user_id THEN
    -- Idempotent success
    RETURN QUERY SELECT 
      v_row.id, v_row.user_id, v_row.email, v_row.role, 
      v_row.is_admin, v_row.university_id, v_row.admin_level, v_row.created_at;
  ELSE
    -- Claimed by a different user
    RAISE EXCEPTION 'Unsafe overwrite blocked: email % already claimed by user %', v_email, v_row.user_id;
  END IF;
END;
$$;

COMMIT;
