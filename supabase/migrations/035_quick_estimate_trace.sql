-- Sprint 12B: structured estimate trace on quick estimates
ALTER TABLE quick_estimates
  ADD COLUMN IF NOT EXISTS trace jsonb,
  ADD COLUMN IF NOT EXISTS trace_version text DEFAULT '1.0';

COMMENT ON COLUMN quick_estimates.trace IS 'Structured estimate trace (v1) — explanation layer for quick estimates';
COMMENT ON COLUMN quick_estimates.trace_version IS 'Estimate trace schema version';
