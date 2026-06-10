-- Sprint 3A update: low / typical / high rate ranges for estimating

-- ---------------------------------------------------------------------------
-- subcontractor_rates — cost/charge ranges + confidence
-- ---------------------------------------------------------------------------
alter table public.subcontractor_rates
  add column if not exists low_cost_rate numeric(12, 2),
  add column if not exists typical_cost_rate numeric(12, 2),
  add column if not exists high_cost_rate numeric(12, 2),
  add column if not exists low_charge_rate numeric(12, 2),
  add column if not exists typical_charge_rate numeric(12, 2),
  add column if not exists high_charge_rate numeric(12, 2),
  add column if not exists default_confidence text not null default 'medium';

alter table public.subcontractor_rates
  drop constraint if exists subcontractor_rates_default_confidence_check;

alter table public.subcontractor_rates
  add constraint subcontractor_rates_default_confidence_check check (
    default_confidence in ('low', 'medium', 'high')
  );

-- Backfill range columns from legacy single values
update public.subcontractor_rates
set
  typical_cost_rate = coalesce(typical_cost_rate, cost_rate),
  low_cost_rate = coalesce(low_cost_rate, cost_rate),
  high_cost_rate = coalesce(high_cost_rate, cost_rate),
  typical_charge_rate = coalesce(typical_charge_rate, charge_rate),
  low_charge_rate = coalesce(low_charge_rate, charge_rate),
  high_charge_rate = coalesce(high_charge_rate, charge_rate)
where typical_cost_rate is null
   or low_cost_rate is null
   or high_cost_rate is null
   or typical_charge_rate is null
   or low_charge_rate is null
   or high_charge_rate is null;

-- ---------------------------------------------------------------------------
-- package_rates — base cost/sell ranges
-- ---------------------------------------------------------------------------
alter table public.package_rates
  add column if not exists low_base_cost numeric(12, 2),
  add column if not exists typical_base_cost numeric(12, 2),
  add column if not exists high_base_cost numeric(12, 2),
  add column if not exists low_base_sell numeric(12, 2),
  add column if not exists typical_base_sell numeric(12, 2),
  add column if not exists high_base_sell numeric(12, 2);

update public.package_rates
set
  typical_base_cost = coalesce(typical_base_cost, base_cost),
  low_base_cost = coalesce(low_base_cost, base_cost),
  high_base_cost = coalesce(high_base_cost, base_cost),
  typical_base_sell = coalesce(typical_base_sell, base_sell),
  low_base_sell = coalesce(low_base_sell, base_sell),
  high_base_sell = coalesce(high_base_sell, base_sell)
where typical_base_cost is null
   or low_base_cost is null
   or high_base_cost is null
   or typical_base_sell is null
   or low_base_sell is null
   or high_base_sell is null;
