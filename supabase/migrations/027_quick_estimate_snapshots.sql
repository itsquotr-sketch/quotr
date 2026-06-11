-- Sprint 6A: Quick estimate snapshot versioning

create table if not exists public.quick_estimate_snapshots (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  quick_estimate_id uuid references public.quick_estimates (id) on delete set null,
  snapshot_at timestamptz not null default now(),
  confidence_score integer,
  confidence_level text,
  estimated_cost_low numeric(12, 2),
  estimated_cost_high numeric(12, 2),
  sell_low numeric(12, 2),
  sell_high numeric(12, 2),
  central_estimate numeric(12, 2),
  target_margin_percent numeric(6, 2),
  contingency_percent numeric(6, 2),
  rate_source text,
  trigger_event text,
  calculation_trace jsonb,
  created_at timestamptz not null default now()
);

create index if not exists quick_estimate_snapshots_org_idx
  on public.quick_estimate_snapshots (organisation_id);

create index if not exists quick_estimate_snapshots_project_idx
  on public.quick_estimate_snapshots (project_id, snapshot_at desc);

create index if not exists quick_estimate_snapshots_estimate_idx
  on public.quick_estimate_snapshots (quick_estimate_id, snapshot_at desc);

alter table public.quick_estimate_snapshots enable row level security;

create policy "Users can view org quick estimate snapshots"
  on public.quick_estimate_snapshots for select
  using (organisation_id = public.get_user_organisation_id());

create policy "Users can create org quick estimate snapshots"
  on public.quick_estimate_snapshots for insert
  with check (organisation_id = public.get_user_organisation_id());

create policy "Users can delete org quick estimate snapshots"
  on public.quick_estimate_snapshots for delete
  using (organisation_id = public.get_user_organisation_id());
