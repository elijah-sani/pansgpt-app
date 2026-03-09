-- =============================================================
-- LBAC Migration: Add target_levels to pans_library
-- Run this in the Supabase SQL Editor
-- =============================================================

-- 1. Add target_levels column (text array, default empty)
ALTER TABLE pans_library
ADD COLUMN IF NOT EXISTS target_levels text[] DEFAULT '{}';

-- 2. Add a GIN index for fast array containment queries
CREATE INDEX IF NOT EXISTS idx_pans_library_target_levels
ON pans_library USING GIN (target_levels);

-- 3. Add a comment for documentation
COMMENT ON COLUMN pans_library.target_levels IS
  'Academic levels this document is visible to, e.g. {400lvl,500lvl}. Empty/null = visible to all.';
