-- ============================================================
-- Migration: 01_lecturer_system  (canonical)
-- Lecturer & Access Control — complete idempotent schema.
--
-- HISTORY:
--   The three sub-tables (lecturer_invites, lecturer_materials,
--   access_control) were created manually without RLS.
--   The lecturers table existed from an earlier migration with
--   missing columns that were added via ALTER TABLE.
--   This file is the single source of truth. Safe to re-run.
-- ============================================================


-- ── HELPER FUNCTION ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  new.updated_at = timezone('utc'::text, now());
  RETURN new;
END;
$$ LANGUAGE plpgsql;


-- ── TABLE: lecturers ─────────────────────────────────────────────────────────
-- Table was created by an earlier migration. Columns added via ALTER TABLE.
CREATE TABLE IF NOT EXISTS public.lecturers (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  full_name                text,
  department               text,
  email                    text,
  has_completed_onboarding boolean     NOT NULL DEFAULT false,
  created_at               timestamptz DEFAULT now()
);

-- Patch: add any columns that may be missing on existing installs
ALTER TABLE public.lecturers ADD COLUMN IF NOT EXISTS full_name                text;
ALTER TABLE public.lecturers ADD COLUMN IF NOT EXISTS department               text;
ALTER TABLE public.lecturers ADD COLUMN IF NOT EXISTS email                    text;
ALTER TABLE public.lecturers ADD COLUMN IF NOT EXISTS has_completed_onboarding boolean NOT NULL DEFAULT false;


-- Unique: one lecturer row per auth user
ALTER TABLE public.lecturers DROP CONSTRAINT IF EXISTS lecturers_user_id_key;
ALTER TABLE public.lecturers ADD  CONSTRAINT lecturers_user_id_key UNIQUE (user_id);

CREATE INDEX IF NOT EXISTS lecturers_user_id_idx ON public.lecturers(user_id);

ALTER TABLE public.lecturers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lecturers_select_policy"            ON public.lecturers;
DROP POLICY IF EXISTS "lecturers_insert_policy"            ON public.lecturers;
DROP POLICY IF EXISTS "lecturers_update_policy"            ON public.lecturers;
DROP POLICY IF EXISTS "lecturers_delete_policy"            ON public.lecturers;
DROP POLICY IF EXISTS "lecturers_service_role_policy"      ON public.lecturers;
DROP POLICY IF EXISTS "lecturers_select_all_authenticated" ON public.lecturers;
DROP POLICY IF EXISTS "lecturers_insert_own_or_admin"      ON public.lecturers;
DROP POLICY IF EXISTS "lecturers_update_own_or_admin"      ON public.lecturers;
DROP POLICY IF EXISTS "lecturers_delete_own_or_admin"      ON public.lecturers;
DROP POLICY IF EXISTS "lecturers_service_role_all"         ON public.lecturers;

CREATE POLICY "lecturers_select_all_authenticated"
  ON public.lecturers FOR SELECT TO authenticated USING (true);

CREATE POLICY "lecturers_insert_own_or_admin"
  ON public.lecturers FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.email = auth.email() AND lower(ur.role) = 'super_admin')
  );

CREATE POLICY "lecturers_update_own_or_admin"
  ON public.lecturers FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.email = auth.email() AND lower(ur.role) = 'super_admin')
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.email = auth.email() AND lower(ur.role) = 'super_admin')
  );

CREATE POLICY "lecturers_delete_own_or_admin"
  ON public.lecturers FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.email = auth.email() AND lower(ur.role) = 'super_admin')
  );

CREATE POLICY "lecturers_service_role_all"
  ON public.lecturers FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── TABLE: lecturer_invites ───────────────────────────────────────────────────
-- Created manually (without RLS). This block is idempotent.
CREATE TABLE IF NOT EXISTS public.lecturer_invites (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text        UNIQUE NOT NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  created_by  uuid        REFERENCES auth.users(id),
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lecturer_invites_code_idx ON public.lecturer_invites(code);

ALTER TABLE public.lecturer_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lecturer_invites_super_admin_all"  ON public.lecturer_invites;
DROP POLICY IF EXISTS "lecturer_invites_service_role_all" ON public.lecturer_invites;

-- Only super_admins can manage invite codes
CREATE POLICY "lecturer_invites_super_admin_all"
  ON public.lecturer_invites FOR ALL TO authenticated
  USING   (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.email = auth.email() AND lower(ur.role) = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.email = auth.email() AND lower(ur.role) = 'super_admin'));

-- Validation endpoint uses service role (no JWT)
CREATE POLICY "lecturer_invites_service_role_all"
  ON public.lecturer_invites FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── TABLE: lecturer_materials ─────────────────────────────────────────────────
-- Created manually (without RLS). This block is idempotent.
CREATE TABLE IF NOT EXISTS public.lecturer_materials (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lecturer_id      uuid        REFERENCES public.lecturers(id) ON DELETE CASCADE NOT NULL,
  file_name        text        NOT NULL,
  drive_file_id    text        NOT NULL,
  course_name      text        NOT NULL,
  course_code      text        NOT NULL,
  level            text        NOT NULL,
  notes_for_admin  text,
  status           text        NOT NULL DEFAULT 'pending',
  submitted_at     timestamptz DEFAULT now(),
  reviewed_at      timestamptz,
  reviewed_by      uuid        REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS lecturer_materials_lecturer_id_idx ON public.lecturer_materials(lecturer_id);
CREATE INDEX IF NOT EXISTS lecturer_materials_status_idx      ON public.lecturer_materials(status);

ALTER TABLE public.lecturer_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lecturer_materials_own_lecturer"          ON public.lecturer_materials;
DROP POLICY IF EXISTS "lecturer_materials_super_admin_read_update" ON public.lecturer_materials;
DROP POLICY IF EXISTS "lecturer_materials_super_admin_select"    ON public.lecturer_materials;
DROP POLICY IF EXISTS "lecturer_materials_super_admin_update"    ON public.lecturer_materials;
DROP POLICY IF EXISTS "lecturer_materials_service_role_all"      ON public.lecturer_materials;

-- Lecturer: full access to their own submissions
CREATE POLICY "lecturer_materials_own_lecturer"
  ON public.lecturer_materials FOR ALL TO authenticated
  USING   (EXISTS (SELECT 1 FROM public.lecturers l WHERE l.id = lecturer_id AND l.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.lecturers l WHERE l.id = lecturer_id AND l.user_id = auth.uid()));

-- Super admin: read all submissions
CREATE POLICY "lecturer_materials_super_admin_select"
  ON public.lecturer_materials FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.email = auth.email() AND lower(ur.role) = 'super_admin'));

-- Super admin: approve / reject (update only)
CREATE POLICY "lecturer_materials_super_admin_update"
  ON public.lecturer_materials FOR UPDATE TO authenticated
  USING   (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.email = auth.email() AND lower(ur.role) = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.email = auth.email() AND lower(ur.role) = 'super_admin'));

CREATE POLICY "lecturer_materials_service_role_all"
  ON public.lecturer_materials FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── TABLE: access_control ────────────────────────────────────────────────────
-- Created manually (without RLS). This block is idempotent.
CREATE TABLE IF NOT EXISTS public.access_control (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lecturer_id      uuid        REFERENCES public.lecturers(id) ON DELETE CASCADE NOT NULL,
  lecturer_name    text        NOT NULL,
  level            text        NOT NULL,
  is_active        boolean     NOT NULL DEFAULT false,
  duration_minutes integer     NOT NULL,
  activated_at     timestamptz,
  auto_ends_at     timestamptz,
  ended_at         timestamptz,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS access_control_level_idx     ON public.access_control(level);
CREATE INDEX IF NOT EXISTS access_control_is_active_idx ON public.access_control(is_active);

ALTER TABLE public.access_control ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "access_control_select_all_authenticated" ON public.access_control;
DROP POLICY IF EXISTS "access_control_insert_own"               ON public.access_control;
DROP POLICY IF EXISTS "access_control_update_own_or_admin"      ON public.access_control;
DROP POLICY IF EXISTS "access_control_service_role_all"         ON public.access_control;

-- All authenticated users can read (students need this to check lockout status)
CREATE POLICY "access_control_select_all_authenticated"
  ON public.access_control FOR SELECT TO authenticated USING (true);

-- Lecturers insert their own records; super_admin can too
CREATE POLICY "access_control_insert_own"
  ON public.access_control FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.lecturers l WHERE l.id = lecturer_id AND l.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.email = auth.email() AND lower(ur.role) = 'super_admin')
  );

-- Lecturers update (disable) their own records; super_admin can too
CREATE POLICY "access_control_update_own_or_admin"
  ON public.access_control FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.lecturers l WHERE l.id = lecturer_id AND l.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.email = auth.email() AND lower(ur.role) = 'super_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.lecturers l WHERE l.id = lecturer_id AND l.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.email = auth.email() AND lower(ur.role) = 'super_admin')
  );

CREATE POLICY "access_control_service_role_all"
  ON public.access_control FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── Notify PostgREST to reload schema cache ───────────────────────────────────
NOTIFY pgrst, 'reload schema';
