-- Sprint 10A: Organisation scope rates for quick estimates

create table if not exists public.scope_rates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  scope_type_key text not null,
  label text not null,
  unit text not null,
  budget_rate numeric(12, 2),
  standard_rate numeric(12, 2),
  premium_rate numeric(12, 2),
  default_rate numeric(12, 2),
  labour_allocation_percent numeric(5, 2),
  materials_allocation_percent numeric(5, 2),
  subcontractor_allocation_percent numeric(5, 2),
  allowance_allocation_percent numeric(5, 2),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, scope_type_key, unit)
);

create index if not exists scope_rates_organisation_id_idx
  on public.scope_rates (organisation_id);

create index if not exists scope_rates_org_active_idx
  on public.scope_rates (organisation_id, is_active);

drop trigger if exists scope_rates_updated_at on public.scope_rates;
create trigger scope_rates_updated_at
  before update on public.scope_rates
  for each row execute function public.set_updated_at();

alter table public.scope_rates enable row level security;

create policy "Users can view org scope rates"
  on public.scope_rates for select
  using (organisation_id = public.get_user_organisation_id());

create policy "Users can create org scope rates"
  on public.scope_rates for insert
  with check (organisation_id = public.get_user_organisation_id());

create policy "Users can update org scope rates"
  on public.scope_rates for update
  using (organisation_id = public.get_user_organisation_id());

create policy "Users can delete org scope rates"
  on public.scope_rates for delete
  using (organisation_id = public.get_user_organisation_id());
