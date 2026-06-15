-- Hotfix: quick estimate trace + estimate status columns (idempotent)
-- Run manually in Supabase SQL Editor if migration tooling is not connected.
--
-- If PGRST204 persists after running this script:
-- 1. Restart your local Next.js dev server
-- 2. In Supabase Dashboard: Settings → API → reload schema (or re-run this script)
-- 3. Re-run this script in the SQL Editor

ALTER TABLE public.quick_estimates
  ADD COLUMN IF NOT EXISTS trace jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.quick_estimates
  ADD COLUMN IF NOT EXISTS trace_version text DEFAULT '1.0';

ALTER TABLE public.quick_estimates
  ADD COLUMN IF NOT EXISTS estimate_status text DEFAULT 'draft';

ALTER TABLE public.quick_estimates
  ADD COLUMN IF NOT EXISTS failure_reason text;

ALTER TABLE public.quick_estimates
  ADD COLUMN IF NOT EXISTS last_calculated_at timestamptz;

UPDATE public.quick_estimates
SET trace = '{}'::jsonb
WHERE trace IS NULL;

UPDATE public.quick_estimates
SET trace_version = '1.0'
WHERE trace_version IS NULL;

UPDATE public.quick_estimates
SET estimate_status = COALESCE(
  CASE
    WHEN status = 'ready' THEN 'ready'
    WHEN status = 'draft' THEN 'draft'
    ELSE 'draft'
  END,
  'draft'
)
WHERE estimate_status IS NULL;

ALTER TABLE public.quick_estimate_snapshots
  ADD COLUMN IF NOT EXISTS calculation_trace jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.quick_estimate_snapshots
  ADD COLUMN IF NOT EXISTS trace_version text DEFAULT '1.0';

UPDATE public.quick_estimate_snapshots
SET calculation_trace = '{}'::jsonb
WHERE calculation_trace IS NULL;

UPDATE public.quick_estimate_snapshots
SET trace_version = '1.0'
WHERE trace_version IS NULL;

COMMENT ON COLUMN public.quick_estimates.trace IS 'Structured estimate trace (v1) — explanation layer for quick estimates';
COMMENT ON COLUMN public.quick_estimates.trace_version IS 'Estimate trace schema version';
COMMENT ON COLUMN public.quick_estimates.estimate_status IS 'Estimate generation status: draft, ready, failed, partial';
COMMENT ON COLUMN public.quick_estimates.failure_reason IS 'User-facing reason when estimate_status is failed';
COMMENT ON COLUMN public.quick_estimates.last_calculated_at IS 'Timestamp of last successful estimate calculation';

NOTIFY pgrst, 'reload schema';
