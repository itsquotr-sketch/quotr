-- Discovery Engine V1 tables (rule-based) — prepares for AI provider in V2

create table if not exists public.discovery_runs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  input_text text,
  input_hash text,
  provider text not null default 'rule_based',
  model text,
  prompt_version text not null default 'rule_based_v1',
  raw_output jsonb,
  parsed_output jsonb,
  status text not null default 'completed',
  error_message text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discovery_runs_status_check
    check (status in ('pending', 'running', 'completed', 'failed'))
);

create index if not exists discovery_runs_organisation_id_idx
  on public.discovery_runs (organisation_id);

create index if not exists discovery_runs_project_id_idx
  on public.discovery_runs (project_id);

create index if not exists discovery_runs_input_hash_idx
  on public.discovery_runs (project_id, input_hash);

drop trigger if exists discovery_runs_updated_at on public.discovery_runs;
create trigger discovery_runs_updated_at
  before update on public.discovery_runs
  for each row execute function public.set_updated_at();

alter table public.discovery_runs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'discovery_runs'
      and policyname = 'Users can view org discovery runs'
  ) then
    create policy "Users can view org discovery runs"
      on public.discovery_runs for select
      using (organisation_id = public.get_user_organisation_id());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'discovery_runs'
      and policyname = 'Users can create org discovery runs'
  ) then
    create policy "Users can create org discovery runs"
      on public.discovery_runs for insert
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
      and tablename = 'discovery_runs'
      and policyname = 'Users can update org discovery runs'
  ) then
    create policy "Users can update org discovery runs"
      on public.discovery_runs for update
      using (organisation_id = public.get_user_organisation_id());
  end if;
end $$;

create table if not exists public.discovery_outputs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  discovery_run_id uuid not null references public.discovery_runs (id) on delete cascade,
  output_type text not null,
  output_key text not null,
  title text,
  content jsonb not null default '{}',
  confidence numeric(5, 2),
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discovery_outputs_type_check
    check (
      output_type in (
        'work_area',
        'fact',
        'question',
        'constraint',
        'trade',
        'risk',
        'assumption'
      )
    ),
  constraint discovery_outputs_status_check
    check (status in ('pending', 'accepted', 'rejected', 'converted'))
);

create index if not exists discovery_outputs_organisation_id_idx
  on public.discovery_outputs (organisation_id);

create index if not exists discovery_outputs_project_id_idx
  on public.discovery_outputs (project_id);

create index if not exists discovery_outputs_discovery_run_id_idx
  on public.discovery_outputs (discovery_run_id);

create unique index if not exists discovery_outputs_run_type_key_idx
  on public.discovery_outputs (discovery_run_id, output_type, output_key);

drop trigger if exists discovery_outputs_updated_at on public.discovery_outputs;
create trigger discovery_outputs_updated_at
  before update on public.discovery_outputs
  for each row execute function public.set_updated_at();

alter table public.discovery_outputs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'discovery_outputs'
      and policyname = 'Users can view org discovery outputs'
  ) then
    create policy "Users can view org discovery outputs"
      on public.discovery_outputs for select
      using (organisation_id = public.get_user_organisation_id());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'discovery_outputs'
      and policyname = 'Users can create org discovery outputs'
  ) then
    create policy "Users can create org discovery outputs"
      on public.discovery_outputs for insert
      with check (
        organisation_id = public.get_user_organisation_id()
        and exists (
          select 1 from public.discovery_runs dr
          where dr.id = discovery_run_id
            and dr.organisation_id = public.get_user_organisation_id()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'discovery_outputs'
      and policyname = 'Users can update org discovery outputs'
  ) then
    create policy "Users can update org discovery outputs"
      on public.discovery_outputs for update
      using (organisation_id = public.get_user_organisation_id());
  end if;
end $$;

notify pgrst, 'reload schema';
