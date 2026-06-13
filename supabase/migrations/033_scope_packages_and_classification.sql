-- Sprint 10C: Work packages + scope classification status

alter table public.project_scopes
  add column if not exists classification_status text not null default 'confirmed';

alter table public.project_scopes
  drop constraint if exists project_scopes_classification_status_check;

alter table public.project_scopes
  add constraint project_scopes_classification_status_check check (
    classification_status in ('confirmed', 'broad_category', 'needs_clarification')
  );

create table if not exists public.project_scope_packages (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  project_scope_id uuid references public.project_scopes (id) on delete cascade,
  package_key text not null,
  label text not null,
  status text not null default 'suggested',
  quantity numeric,
  unit text,
  metadata jsonb not null default '{}',
  include_in_quick_estimate boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_scope_packages_status_check check (
    status in ('suggested', 'confirmed', 'rejected')
  )
);

create index if not exists project_scope_packages_project_id_idx
  on public.project_scope_packages (project_id);

create index if not exists project_scope_packages_organisation_id_idx
  on public.project_scope_packages (organisation_id);

create index if not exists project_scope_packages_scope_id_idx
  on public.project_scope_packages (project_scope_id);

create unique index if not exists project_scope_packages_unique_key_idx
  on public.project_scope_packages (project_id, project_scope_id, package_key)
  where status != 'rejected';

drop trigger if exists project_scope_packages_updated_at on public.project_scope_packages;
create trigger project_scope_packages_updated_at
  before update on public.project_scope_packages
  for each row execute function public.set_updated_at();

alter table public.project_scope_packages enable row level security;

create policy "Users can view org project scope packages"
  on public.project_scope_packages for select
  using (organisation_id = public.get_user_organisation_id());

create policy "Users can create org project scope packages"
  on public.project_scope_packages for insert
  with check (
    organisation_id = public.get_user_organisation_id()
    and exists (
      select 1 from public.projects p
      where p.id = project_id
        and p.organisation_id = public.get_user_organisation_id()
    )
  );

create policy "Users can update org project scope packages"
  on public.project_scope_packages for update
  using (organisation_id = public.get_user_organisation_id());

create policy "Users can delete org project scope packages"
  on public.project_scope_packages for delete
  using (organisation_id = public.get_user_organisation_id());
