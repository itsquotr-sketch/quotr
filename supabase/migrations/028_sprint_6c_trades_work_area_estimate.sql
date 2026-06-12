-- Sprint 6C: project trades + work area include/exclude for quick estimate

alter table public.project_scopes
  add column if not exists include_in_quick_estimate boolean not null default true;

create table if not exists public.project_trades (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  project_scope_id uuid references public.project_scopes (id) on delete set null,
  trade_name text not null,
  note text,
  source text not null default 'user',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_trades_org_idx
  on public.project_trades (organisation_id);

create index if not exists project_trades_project_idx
  on public.project_trades (project_id);

create index if not exists project_trades_scope_idx
  on public.project_trades (project_scope_id)
  where project_scope_id is not null;

create trigger project_trades_updated_at
  before update on public.project_trades
  for each row execute function public.set_updated_at();

alter table public.project_trades enable row level security;

create policy "Users can view org project trades"
  on public.project_trades for select
  using (organisation_id = public.get_user_organisation_id());

create policy "Users can create org project trades"
  on public.project_trades for insert
  with check (organisation_id = public.get_user_organisation_id());

create policy "Users can update org project trades"
  on public.project_trades for update
  using (organisation_id = public.get_user_organisation_id());

create policy "Users can delete org project trades"
  on public.project_trades for delete
  using (organisation_id = public.get_user_organisation_id());
