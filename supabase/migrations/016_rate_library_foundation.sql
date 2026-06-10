-- Sprint 3A: Rate library and organisation pricing settings

-- ---------------------------------------------------------------------------
-- labour_rates
-- ---------------------------------------------------------------------------
create table if not exists public.labour_rates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  name text not null,
  category text,
  cost_rate numeric(12, 2) not null default 0,
  charge_rate numeric(12, 2) not null default 0,
  unit text not null default 'hour',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists labour_rates_organisation_id_idx
  on public.labour_rates (organisation_id);

create index if not exists labour_rates_org_active_idx
  on public.labour_rates (organisation_id, is_active);

drop trigger if exists labour_rates_updated_at on public.labour_rates;
create trigger labour_rates_updated_at
  before update on public.labour_rates
  for each row execute function public.set_updated_at();

alter table public.labour_rates enable row level security;

create policy "Users can view org labour rates"
  on public.labour_rates for select
  using (organisation_id = public.get_user_organisation_id());

create policy "Users can create org labour rates"
  on public.labour_rates for insert
  with check (organisation_id = public.get_user_organisation_id());

create policy "Users can update org labour rates"
  on public.labour_rates for update
  using (organisation_id = public.get_user_organisation_id());

create policy "Users can delete org labour rates"
  on public.labour_rates for delete
  using (organisation_id = public.get_user_organisation_id());

-- ---------------------------------------------------------------------------
-- subcontractor_rates
-- ---------------------------------------------------------------------------
create table if not exists public.subcontractor_rates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  trade text not null,
  description text,
  cost_rate numeric(12, 2) not null default 0,
  charge_rate numeric(12, 2) not null default 0,
  unit text not null default 'hour',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subcontractor_rates_organisation_id_idx
  on public.subcontractor_rates (organisation_id);

create index if not exists subcontractor_rates_org_active_idx
  on public.subcontractor_rates (organisation_id, is_active);

drop trigger if exists subcontractor_rates_updated_at on public.subcontractor_rates;
create trigger subcontractor_rates_updated_at
  before update on public.subcontractor_rates
  for each row execute function public.set_updated_at();

alter table public.subcontractor_rates enable row level security;

create policy "Users can view org subcontractor rates"
  on public.subcontractor_rates for select
  using (organisation_id = public.get_user_organisation_id());

create policy "Users can create org subcontractor rates"
  on public.subcontractor_rates for insert
  with check (organisation_id = public.get_user_organisation_id());

create policy "Users can update org subcontractor rates"
  on public.subcontractor_rates for update
  using (organisation_id = public.get_user_organisation_id());

create policy "Users can delete org subcontractor rates"
  on public.subcontractor_rates for delete
  using (organisation_id = public.get_user_organisation_id());

-- ---------------------------------------------------------------------------
-- material_rates
-- ---------------------------------------------------------------------------
create table if not exists public.material_rates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  material_name text not null,
  category text,
  cost_rate numeric(12, 2) not null default 0,
  charge_rate numeric(12, 2) not null default 0,
  unit text not null default 'each',
  supplier text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists material_rates_organisation_id_idx
  on public.material_rates (organisation_id);

create index if not exists material_rates_org_active_idx
  on public.material_rates (organisation_id, is_active);

drop trigger if exists material_rates_updated_at on public.material_rates;
create trigger material_rates_updated_at
  before update on public.material_rates
  for each row execute function public.set_updated_at();

alter table public.material_rates enable row level security;

create policy "Users can view org material rates"
  on public.material_rates for select
  using (organisation_id = public.get_user_organisation_id());

create policy "Users can create org material rates"
  on public.material_rates for insert
  with check (organisation_id = public.get_user_organisation_id());

create policy "Users can update org material rates"
  on public.material_rates for update
  using (organisation_id = public.get_user_organisation_id());

create policy "Users can delete org material rates"
  on public.material_rates for delete
  using (organisation_id = public.get_user_organisation_id());

-- ---------------------------------------------------------------------------
-- package_rates
-- ---------------------------------------------------------------------------
create table if not exists public.package_rates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  package_name text not null,
  work_area_type text,
  description text,
  unit text not null default 'each',
  base_cost numeric(12, 2) not null default 0,
  base_sell numeric(12, 2) not null default 0,
  default_margin numeric(6, 2),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists package_rates_organisation_id_idx
  on public.package_rates (organisation_id);

create index if not exists package_rates_org_active_idx
  on public.package_rates (organisation_id, is_active);

drop trigger if exists package_rates_updated_at on public.package_rates;
create trigger package_rates_updated_at
  before update on public.package_rates
  for each row execute function public.set_updated_at();

alter table public.package_rates enable row level security;

create policy "Users can view org package rates"
  on public.package_rates for select
  using (organisation_id = public.get_user_organisation_id());

create policy "Users can create org package rates"
  on public.package_rates for insert
  with check (organisation_id = public.get_user_organisation_id());

create policy "Users can update org package rates"
  on public.package_rates for update
  using (organisation_id = public.get_user_organisation_id());

create policy "Users can delete org package rates"
  on public.package_rates for delete
  using (organisation_id = public.get_user_organisation_id());

-- ---------------------------------------------------------------------------
-- organisation_pricing_settings
-- ---------------------------------------------------------------------------
create table if not exists public.organisation_pricing_settings (
  organisation_id uuid primary key references public.organisations (id) on delete cascade,
  default_margin_percent numeric(6, 2) not null default 20,
  contingency_percent numeric(6, 2) not null default 5,
  gst_percent numeric(6, 2) not null default 15,
  currency text not null default 'NZD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists organisation_pricing_settings_updated_at
  on public.organisation_pricing_settings;
create trigger organisation_pricing_settings_updated_at
  before update on public.organisation_pricing_settings
  for each row execute function public.set_updated_at();

alter table public.organisation_pricing_settings enable row level security;

create policy "Users can view org pricing settings"
  on public.organisation_pricing_settings for select
  using (organisation_id = public.get_user_organisation_id());

create policy "Users can create org pricing settings"
  on public.organisation_pricing_settings for insert
  with check (organisation_id = public.get_user_organisation_id());

create policy "Users can update org pricing settings"
  on public.organisation_pricing_settings for update
  using (organisation_id = public.get_user_organisation_id());

create policy "Users can delete org pricing settings"
  on public.organisation_pricing_settings for delete
  using (organisation_id = public.get_user_organisation_id());
