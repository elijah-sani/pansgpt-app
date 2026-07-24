-- AI Usage Analytics v2: Error tracking, image tokens, and character estimation
-- Run this in the Supabase SQL Editor.

BEGIN;

-- 1. Add new columns for error tracking and detailed token estimation
ALTER TABLE public.ai_usage_logs 
  ADD COLUMN IF NOT EXISTS error_type text null,
  ADD COLUMN IF NOT EXISTS error_message text null,
  ADD COLUMN IF NOT EXISTS image_count integer not null default 0,
  ADD COLUMN IF NOT EXISTS prompt_character_count integer not null default 0,
  ADD COLUMN IF NOT EXISTS completion_character_count integer not null default 0;

-- 2. Drop restrictive check constraints if present
ALTER TABLE public.ai_usage_logs 
  DROP CONSTRAINT IF EXISTS ai_usage_logs_status_check,
  DROP CONSTRAINT IF EXISTS ai_usage_logs_request_type_check;

-- 3. Add updated status check constraint
ALTER TABLE public.ai_usage_logs
  ADD CONSTRAINT ai_usage_logs_status_check 
  CHECK (status IN ('success', 'error', 'timeout', 'failover', 'content_blocked'));

-- 4. Add index for error diagnostics queries
CREATE INDEX IF NOT EXISTS ai_usage_logs_error_type_idx
  ON public.ai_usage_logs (error_type)
  WHERE error_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS ai_usage_logs_status_idx
  ON public.ai_usage_logs (status);

COMMIT;
