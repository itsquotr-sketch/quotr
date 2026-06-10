-- Sprint 4A.1: client budget / finish level on quick estimates

alter table public.quick_estimates
  add column if not exists quality_level text not null default 'unknown';

alter table public.quick_estimates
  drop constraint if exists quick_estimates_quality_level_check;

alter table public.quick_estimates
  add constraint quick_estimates_quality_level_check
  check (quality_level in ('budget', 'standard', 'premium', 'unknown'));

notify pgrst, 'reload schema';
