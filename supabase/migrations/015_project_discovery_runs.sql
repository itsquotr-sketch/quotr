-- Sprint 2D: Discovery Engine — persist discovery runs per project

create table if not exists public.project_discovery_runs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  source_notes text,
  provider text not null,
  provider_version text not null,
  work_areas jsonb not null default '[]'::jsonb,
  facts jsonb not null default '[]'::jsonb,
  questions jsonb not null default '[]'::jsonb,
  constraints jsonb not null default '[]'::jsonb,
  trades jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_discovery_runs_organisation_id_idx
  on public.project_discovery_runs (organisation_id);

create index if not exists project_discovery_runs_project_id_idx
  on public.project_discovery_runs (project_id);

create index if not exists project_discovery_runs_project_created_idx
  on public.project_discovery_runs (project_id, created_at desc);

drop trigger if exists project_discovery_runs_updated_at on public.project_discovery_runs;
create trigger project_discovery_runs_updated_at
  before update on public.project_discovery_runs
  for each row execute function public.set_updated_at();

alter table public.project_discovery_runs enable row level security;

create policy "Users can view org project discovery runs"
  on public.project_discovery_runs for select
  using (organisation_id = public.get_user_organisation_id());

create policy "Users can create org project discovery runs"
  on public.project_discovery_runs for insert
  with check (
    organisation_id = public.get_user_organisation_id()
    and exists (
      select 1 from public.projects p
      where p.id = project_id
        and p.organisation_id = public.get_user_organisation_id()
    )
  );

create policy "Users can update org project discovery runs"
  on public.project_discovery_runs for update
  using (organisation_id = public.get_user_organisation_id());

create policy "Users can delete org project discovery runs"
  on public.project_discovery_runs for delete
  using (organisation_id = public.get_user_organisation_id());
