-- Idempotent repair: project_estimate_driver_values (migration 014)
-- Fixes PGRST205 "Could not find table public.project_estimate_driver_values"

-- Requires quick_estimates + estimate_drivers from migration 013
create table if not exists public.project_estimate_driver_values (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  quick_estimate_id uuid not null references public.quick_estimates (id) on delete cascade,
  estimate_driver_id uuid references public.estimate_drivers (id) on delete cascade,
  constraint_key text,
  value jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_estimate_driver_values_driver_or_key check (
    estimate_driver_id is not null or constraint_key is not null
  )
);

create index if not exists project_estimate_driver_values_organisation_id_idx
  on public.project_estimate_driver_values (organisation_id);

create index if not exists project_estimate_driver_values_project_id_idx
  on public.project_estimate_driver_values (project_id);

create index if not exists project_estimate_driver_values_quick_estimate_id_idx
  on public.project_estimate_driver_values (quick_estimate_id);

create unique index if not exists project_estimate_driver_values_driver_unique_idx
  on public.project_estimate_driver_values (quick_estimate_id, estimate_driver_id)
  where estimate_driver_id is not null;

create unique index if not exists project_estimate_driver_values_key_unique_idx
  on public.project_estimate_driver_values (quick_estimate_id, constraint_key)
  where constraint_key is not null;

drop trigger if exists project_estimate_driver_values_updated_at
  on public.project_estimate_driver_values;
create trigger project_estimate_driver_values_updated_at
  before update on public.project_estimate_driver_values
  for each row execute function public.set_updated_at();

alter table public.project_estimate_driver_values enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'project_estimate_driver_values'
      and policyname = 'Users can view org project estimate driver values'
  ) then
    create policy "Users can view org project estimate driver values"
      on public.project_estimate_driver_values for select
      using (organisation_id = public.get_user_organisation_id());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'project_estimate_driver_values'
      and policyname = 'Users can create org project estimate driver values'
  ) then
    create policy "Users can create org project estimate driver values"
      on public.project_estimate_driver_values for insert
      with check (organisation_id = public.get_user_organisation_id());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'project_estimate_driver_values'
      and policyname = 'Users can update org project estimate driver values'
  ) then
    create policy "Users can update org project estimate driver values"
      on public.project_estimate_driver_values for update
      using (organisation_id = public.get_user_organisation_id());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'project_estimate_driver_values'
      and policyname = 'Users can delete org project estimate driver values'
  ) then
    create policy "Users can delete org project estimate driver values"
      on public.project_estimate_driver_values for delete
      using (organisation_id = public.get_user_organisation_id());
  end if;
end $$;

-- Ensure project_estimate_drivers exists (migration 013 dependency)
create table if not exists public.project_estimate_drivers (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  quick_estimate_id uuid references public.quick_estimates (id) on delete cascade,
  estimate_driver_id uuid not null references public.estimate_drivers (id) on delete cascade,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint project_estimate_drivers_unique_driver
    unique (quick_estimate_id, estimate_driver_id)
);

create index if not exists project_estimate_drivers_organisation_id_idx
  on public.project_estimate_drivers (organisation_id);

create index if not exists project_estimate_drivers_project_id_idx
  on public.project_estimate_drivers (project_id);

create index if not exists project_estimate_drivers_quick_estimate_id_idx
  on public.project_estimate_drivers (quick_estimate_id);

alter table public.project_estimate_drivers enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'project_estimate_drivers'
      and policyname = 'Users can view org project estimate drivers'
  ) then
    create policy "Users can view org project estimate drivers"
      on public.project_estimate_drivers for select
      using (organisation_id = public.get_user_organisation_id());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'project_estimate_drivers'
      and policyname = 'Users can create org project estimate drivers'
  ) then
    create policy "Users can create org project estimate drivers"
      on public.project_estimate_drivers for insert
      with check (
        organisation_id = public.get_user_organisation_id()
        and exists (
          select 1 from public.projects p
          where p.id = project_id
            and p.organisation_id = public.get_user_organisation_id()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'project_estimate_drivers'
      and policyname = 'Users can update org project estimate drivers'
  ) then
    create policy "Users can update org project estimate drivers"
      on public.project_estimate_drivers for update
      using (organisation_id = public.get_user_organisation_id());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'project_estimate_drivers'
      and policyname = 'Users can delete org project estimate drivers'
  ) then
    create policy "Users can delete org project estimate drivers"
      on public.project_estimate_drivers for delete
      using (organisation_id = public.get_user_organisation_id());
  end if;
end $$;

notify pgrst, 'reload schema';
