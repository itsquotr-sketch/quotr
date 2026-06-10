-- Live schema repair — run in Supabase SQL Editor if projects table is missing.
-- Idempotent. Safe to run multiple times.
--
-- Aligns legacy DBs with migrations 001–011 and the Quotr application schema.
-- After running: PostgREST schema cache is reloaded automatically.

-- ---------------------------------------------------------------------------
-- 0. RLS helper functions (MUST run before any policies)
-- ---------------------------------------------------------------------------
create or replace function public.get_user_organisation_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organisation_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select public.get_user_organisation_id();
$$;

grant execute on function public.get_user_organisation_id() to authenticated;
grant execute on function public.current_org_id() to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Rename jobs → projects (canonical table name)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'jobs'
  ) then
    if not exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'projects'
    ) then
      alter table public.jobs rename to projects;
      raise notice 'Renamed jobs → projects';
    elsif not exists (select 1 from public.projects limit 1) then
      drop table public.projects cascade;
      alter table public.jobs rename to projects;
      raise notice 'Dropped empty projects, renamed jobs → projects';
    else
      raise exception 'Both jobs and projects exist with data — resolve manually before running this script';
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Rename job_id → project_id on all child tables
-- ---------------------------------------------------------------------------
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'project_scopes',
    'project_scope_builder_inputs',
    'project_scope_suggestions',
    'estimate_sections',
    'rfq_packages'
  ]
  loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = tbl
        and column_name = 'job_id'
    ) then
      execute format(
        'alter table public.%I rename column job_id to project_id',
        tbl
      );
      raise notice 'Renamed %.job_id → project_id', tbl;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Ensure core tables exist (minimal create-if-missing for live repair)
-- ---------------------------------------------------------------------------
create table if not exists public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  name text not null,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scope_types (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations (id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  organisation_id uuid references public.organisations (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  title text not null,
  client_name text not null,
  client_phone text,
  client_email text,
  site_address text not null,
  enquiry_source text not null,
  client_brief text,
  priority text not null default 'normal',
  status text not null default 'enquiry',
  quote_status text not null default 'not_started',
  initial_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_scopes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  scope_type_id uuid references public.scope_types (id) on delete set null,
  name text not null,
  description text,
  location_area text,
  notes text,
  status text not null default 'draft',
  ai_status text not null default 'not_started',
  ai_confidence numeric(5, 2),
  estimate_status text not null default 'not_started',
  is_custom boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_scope_builder_inputs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  input_type text not null,
  content text not null,
  status text not null default 'saved',
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_scope_suggestions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  source_input_id uuid references public.project_scope_builder_inputs (id) on delete set null,
  suggested_scope_type text not null,
  suggested_name text not null,
  suggested_description text,
  suggested_location_area text,
  confidence numeric(5, 2),
  status text not null default 'pending',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scope_measurements (
  id uuid primary key default gen_random_uuid(),
  project_scope_id uuid not null references public.project_scopes (id) on delete cascade,
  label text not null,
  value text not null,
  unit text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.scope_photos (
  id uuid primary key default gen_random_uuid(),
  project_scope_id uuid not null references public.project_scopes (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.scope_documents (
  id uuid primary key default gen_random_uuid(),
  project_scope_id uuid not null references public.project_scopes (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  created_at timestamptz not null default now()
);

create table if not exists public.scope_questions (
  id uuid primary key default gen_random_uuid(),
  project_scope_id uuid not null references public.project_scopes (id) on delete cascade,
  question text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.scope_answers (
  id uuid primary key default gen_random_uuid(),
  scope_question_id uuid not null references public.scope_questions (id) on delete cascade,
  project_scope_id uuid not null references public.project_scopes (id) on delete cascade,
  answer text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.estimate_sections (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  project_scope_id uuid references public.project_scopes (id) on delete set null,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.estimate_items (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  estimate_section_id uuid not null references public.estimate_sections (id) on delete cascade,
  project_scope_id uuid references public.project_scopes (id) on delete set null,
  description text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.rfq_packages (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  project_scope_id uuid references public.project_scopes (id) on delete set null,
  trade_name text not null,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

create table if not exists public.ai_scope_runs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  project_scope_id uuid not null references public.project_scopes (id) on delete cascade,
  status text not null default 'pending',
  confidence numeric(5, 2),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. Add missing columns on existing tables (legacy / partial migrations)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists phone text,
  add column if not exists job_title text,
  add column if not exists organisation_id uuid references public.organisations (id) on delete set null;

alter table public.projects
  add column if not exists organisation_id uuid references public.organisations (id) on delete cascade,
  add column if not exists created_by uuid references auth.users (id) on delete cascade,
  add column if not exists client_name text,
  add column if not exists client_phone text,
  add column if not exists client_email text,
  add column if not exists site_address text,
  add column if not exists enquiry_source text,
  add column if not exists client_brief text,
  add column if not exists priority text not null default 'normal',
  add column if not exists status text not null default 'enquiry',
  add column if not exists quote_status text not null default 'not_started',
  add column if not exists initial_notes text,
  add column if not exists enquiry_status text not null default 'new',
  add column if not exists description text,
  add column if not exists job_type text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'clients'
  ) then
    alter table public.projects
      add column if not exists client_id uuid references public.clients (id) on delete set null;
  end if;
end $$;

alter table public.project_scopes
  add column if not exists project_id uuid references public.projects (id) on delete cascade,
  add column if not exists organisation_id uuid references public.organisations (id) on delete cascade,
  add column if not exists notes text,
  add column if not exists ai_confidence numeric(5, 2),
  add column if not exists confidence_level text,
  add column if not exists estimate_status text not null default 'not_started',
  add column if not exists is_custom boolean not null default false,
  add column if not exists ai_status text not null default 'not_started',
  add column if not exists sort_order integer not null default 0,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'scope_types'
  ) then
    alter table public.project_scopes
      add column if not exists scope_type_id uuid references public.scope_types (id) on delete set null;
  end if;
end $$;

alter table public.project_scope_builder_inputs
  add column if not exists organisation_id uuid references public.organisations (id) on delete cascade,
  add column if not exists project_id uuid references public.projects (id) on delete cascade,
  add column if not exists input_type text,
  add column if not exists content text,
  add column if not exists status text not null default 'saved',
  add column if not exists created_by uuid references auth.users (id) on delete cascade,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.project_scope_suggestions
  add column if not exists organisation_id uuid references public.organisations (id) on delete cascade,
  add column if not exists project_id uuid references public.projects (id) on delete cascade,
  add column if not exists source_input_id uuid references public.project_scope_builder_inputs (id) on delete set null,
  add column if not exists suggested_scope_type text,
  add column if not exists suggested_name text,
  add column if not exists suggested_description text,
  add column if not exists suggested_location_area text,
  add column if not exists confidence numeric(5, 2),
  add column if not exists status text not null default 'pending',
  add column if not exists created_by uuid references public.profiles (id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.estimate_sections
  add column if not exists organisation_id uuid references public.organisations (id) on delete cascade,
  add column if not exists project_id uuid references public.projects (id) on delete cascade,
  add column if not exists project_scope_id uuid references public.project_scopes (id) on delete set null,
  add column if not exists name text,
  add column if not exists created_at timestamptz not null default now();

alter table public.estimate_items
  add column if not exists organisation_id uuid references public.organisations (id) on delete cascade,
  add column if not exists estimate_section_id uuid references public.estimate_sections (id) on delete cascade,
  add column if not exists project_scope_id uuid references public.project_scopes (id) on delete set null,
  add column if not exists description text,
  add column if not exists created_at timestamptz not null default now();

alter table public.rfq_packages
  add column if not exists organisation_id uuid references public.organisations (id) on delete cascade,
  add column if not exists project_id uuid references public.projects (id) on delete cascade,
  add column if not exists project_scope_id uuid references public.project_scopes (id) on delete set null,
  add column if not exists trade_name text,
  add column if not exists status text not null default 'draft',
  add column if not exists created_at timestamptz not null default now();

alter table public.ai_scope_runs
  add column if not exists organisation_id uuid references public.organisations (id) on delete cascade,
  add column if not exists project_scope_id uuid references public.project_scopes (id) on delete cascade,
  add column if not exists status text not null default 'pending',
  add column if not exists confidence numeric(5, 2),
  add column if not exists created_at timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- 5. Backfill organisation_id (table-specific — never assume column names)
-- ---------------------------------------------------------------------------
do $$
begin
  -- projects ← profiles via created_by
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'projects'
      and column_name = 'organisation_id'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'projects'
      and column_name = 'created_by'
  ) then
    update public.projects p
    set organisation_id = pr.organisation_id
    from public.profiles pr
    where pr.id = p.created_by
      and p.organisation_id is null
      and pr.organisation_id is not null;
  end if;

  -- project_scopes ← projects
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'project_scopes'
      and column_name = 'organisation_id'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'project_scopes'
      and column_name = 'project_id'
  ) then
    update public.project_scopes ps
    set organisation_id = p.organisation_id
    from public.projects p
    where p.id = ps.project_id
      and ps.organisation_id is null
      and p.organisation_id is not null;
  end if;

  -- project_scope_builder_inputs ← projects
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'project_scope_builder_inputs'
      and column_name = 'organisation_id'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'project_scope_builder_inputs'
      and column_name = 'project_id'
  ) then
    update public.project_scope_builder_inputs t
    set organisation_id = p.organisation_id
    from public.projects p
    where p.id = t.project_id
      and t.organisation_id is null
      and p.organisation_id is not null;
  end if;

  -- project_scope_suggestions ← projects
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'project_scope_suggestions'
      and column_name = 'organisation_id'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'project_scope_suggestions'
      and column_name = 'project_id'
  ) then
    update public.project_scope_suggestions t
    set organisation_id = p.organisation_id
    from public.projects p
    where p.id = t.project_id
      and t.organisation_id is null
      and p.organisation_id is not null;
  end if;

  -- estimate_sections ← projects (when project_id exists)
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'estimate_sections'
      and column_name = 'organisation_id'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'estimate_sections'
      and column_name = 'project_id'
  ) then
    update public.estimate_sections t
    set organisation_id = p.organisation_id
    from public.projects p
    where p.id = t.project_id
      and t.organisation_id is null
      and p.organisation_id is not null;
  end if;

  -- estimate_sections ← project_scopes (fallback when no project_id backfill)
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'estimate_sections'
      and column_name = 'organisation_id'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'estimate_sections'
      and column_name = 'project_scope_id'
  ) then
    update public.estimate_sections t
    set organisation_id = ps.organisation_id
    from public.project_scopes ps
    where ps.id = t.project_scope_id
      and t.organisation_id is null
      and ps.organisation_id is not null;
  end if;

  -- rfq_packages ← projects
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'rfq_packages'
      and column_name = 'organisation_id'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'rfq_packages'
      and column_name = 'project_id'
  ) then
    update public.rfq_packages t
    set organisation_id = p.organisation_id
    from public.projects p
    where p.id = t.project_id
      and t.organisation_id is null
      and p.organisation_id is not null;
  end if;

  -- rfq_packages ← project_scopes (fallback)
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'rfq_packages'
      and column_name = 'organisation_id'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'rfq_packages'
      and column_name = 'project_scope_id'
  ) then
    update public.rfq_packages t
    set organisation_id = ps.organisation_id
    from public.project_scopes ps
    where ps.id = t.project_scope_id
      and t.organisation_id is null
      and ps.organisation_id is not null;
  end if;

  -- estimate_items ← estimate_sections
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'estimate_items'
      and column_name = 'organisation_id'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'estimate_items'
      and column_name = 'estimate_section_id'
  ) then
    update public.estimate_items t
    set organisation_id = es.organisation_id
    from public.estimate_sections es
    where es.id = t.estimate_section_id
      and t.organisation_id is null
      and es.organisation_id is not null;
  end if;

  -- ai_scope_runs ← project_scopes
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'ai_scope_runs'
      and column_name = 'organisation_id'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'ai_scope_runs'
      and column_name = 'project_scope_id'
  ) then
    update public.ai_scope_runs t
    set organisation_id = ps.organisation_id
    from public.project_scopes ps
    where ps.id = t.project_scope_id
      and t.organisation_id is null
      and ps.organisation_id is not null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Indexes and triggers
-- ---------------------------------------------------------------------------
create index if not exists projects_organisation_id_idx on public.projects (organisation_id);
create index if not exists project_scopes_project_id_idx on public.project_scopes (project_id);
create index if not exists project_scopes_organisation_id_idx on public.project_scopes (organisation_id);
create index if not exists project_scope_builder_inputs_project_id_idx
  on public.project_scope_builder_inputs (project_id);
create index if not exists project_scope_builder_inputs_organisation_id_idx
  on public.project_scope_builder_inputs (organisation_id);
create index if not exists project_scope_suggestions_project_id_idx
  on public.project_scope_suggestions (project_id);
create index if not exists project_scope_suggestions_organisation_id_idx
  on public.project_scope_suggestions (organisation_id);

create unique index if not exists project_scope_suggestions_pending_unique_idx
  on public.project_scope_suggestions (project_id, suggested_scope_type)
  where status = 'pending';

drop trigger if exists projects_updated_at on public.projects;
create trigger projects_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

drop trigger if exists project_scopes_updated_at on public.project_scopes;
create trigger project_scopes_updated_at
  before update on public.project_scopes
  for each row execute function public.set_updated_at();

drop trigger if exists project_scope_builder_inputs_updated_at
  on public.project_scope_builder_inputs;
create trigger project_scope_builder_inputs_updated_at
  before update on public.project_scope_builder_inputs
  for each row execute function public.set_updated_at();

drop trigger if exists project_scope_suggestions_updated_at
  on public.project_scope_suggestions;
create trigger project_scope_suggestions_updated_at
  before update on public.project_scope_suggestions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 7. Drop legacy policies on core tables (idempotent re-run)
-- ---------------------------------------------------------------------------
do $$
declare
  pol record;
  tbl text;
begin
  foreach tbl in array array[
    'projects',
    'project_scopes',
    'project_scope_builder_inputs',
    'project_scope_suggestions',
    'scope_measurements',
    'scope_photos',
    'scope_documents',
    'scope_questions',
    'scope_answers',
    'estimate_sections',
    'estimate_items',
    'rfq_packages',
    'ai_scope_runs'
  ]
  loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = tbl
    ) then
      for pol in
        select policyname from pg_policies
        where schemaname = 'public' and tablename = tbl
      loop
        execute format('drop policy if exists %I on public.%I', pol.policyname, tbl);
      end loop;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Core RLS (only when organisation_id exists on parent tables)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'projects'
      and column_name = 'organisation_id'
  ) then
    raise notice 'Skipping projects RLS — organisation_id missing';
    return;
  end if;

  alter table public.projects enable row level security;

  create policy "Users can view org projects"
    on public.projects for select
    using (organisation_id = public.get_user_organisation_id());

  create policy "Users can create org projects"
    on public.projects for insert
    with check (
      organisation_id = public.get_user_organisation_id()
      and created_by = auth.uid()
    );

  create policy "Users can update org projects"
    on public.projects for update
    using (organisation_id = public.get_user_organisation_id());

  create policy "Users can delete org projects"
    on public.projects for delete
    using (organisation_id = public.get_user_organisation_id());
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'project_scopes'
      and column_name = 'organisation_id'
  ) then
    raise notice 'Skipping project_scopes RLS — organisation_id missing';
    return;
  end if;

  alter table public.project_scopes enable row level security;

  create policy "Users can view org project scopes"
    on public.project_scopes for select
    using (organisation_id = public.get_user_organisation_id());

  create policy "Users can create org project scopes"
    on public.project_scopes for insert
    with check (organisation_id = public.get_user_organisation_id());

  create policy "Users can update org project scopes"
    on public.project_scopes for update
    using (organisation_id = public.get_user_organisation_id());

  create policy "Users can delete org project scopes"
    on public.project_scopes for delete
    using (organisation_id = public.get_user_organisation_id());
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'project_scope_builder_inputs'
      and column_name = 'organisation_id'
  ) then
    raise notice 'Skipping project_scope_builder_inputs RLS — organisation_id missing';
    return;
  end if;

  alter table public.project_scope_builder_inputs enable row level security;

  create policy "Users can view org scope builder inputs"
    on public.project_scope_builder_inputs for select
    using (organisation_id = public.get_user_organisation_id());

  create policy "Users can create org scope builder inputs"
    on public.project_scope_builder_inputs for insert
    with check (
      organisation_id = public.get_user_organisation_id()
      and created_by = auth.uid()
      and exists (
        select 1 from public.projects p
        where p.id = project_id
          and p.organisation_id = public.get_user_organisation_id()
      )
    );

  create policy "Users can update org scope builder inputs"
    on public.project_scope_builder_inputs for update
    using (organisation_id = public.get_user_organisation_id());

  create policy "Users can delete org scope builder inputs"
    on public.project_scope_builder_inputs for delete
    using (organisation_id = public.get_user_organisation_id());
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'project_scope_suggestions'
      and column_name = 'organisation_id'
  ) then
    raise notice 'Skipping project_scope_suggestions RLS — organisation_id missing';
    return;
  end if;

  alter table public.project_scope_suggestions enable row level security;

  create policy "Users can view org scope suggestions"
    on public.project_scope_suggestions for select
    using (organisation_id = public.get_user_organisation_id());

  create policy "Users can create org scope suggestions"
    on public.project_scope_suggestions for insert
    with check (
      organisation_id = public.get_user_organisation_id()
      and (
        created_by is null
        or created_by = auth.uid()
      )
      and exists (
        select 1 from public.projects p
        where p.id = project_id
          and p.organisation_id = public.get_user_organisation_id()
      )
    );

  create policy "Users can update org scope suggestions"
    on public.project_scope_suggestions for update
    using (organisation_id = public.get_user_organisation_id());

  create policy "Users can delete org scope suggestions"
    on public.project_scope_suggestions for delete
    using (organisation_id = public.get_user_organisation_id());
end $$;

-- Scope child tables (RLS via project_scopes.organisation_id)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'project_scopes'
      and column_name = 'organisation_id'
  ) then
    raise notice 'Skipping scope child RLS — project_scopes.organisation_id missing';
    return;
  end if;

  alter table public.scope_measurements enable row level security;
  alter table public.scope_photos enable row level security;
  alter table public.scope_documents enable row level security;

  create policy "Users can view org scope measurements"
    on public.scope_measurements for select
    using (
      exists (
        select 1 from public.project_scopes ps
        where ps.id = project_scope_id
          and ps.organisation_id = public.get_user_organisation_id()
      )
    );

  create policy "Users can create org scope measurements"
    on public.scope_measurements for insert
    with check (
      exists (
        select 1 from public.project_scopes ps
        where ps.id = project_scope_id
          and ps.organisation_id = public.get_user_organisation_id()
      )
    );

  create policy "Users can update org scope measurements"
    on public.scope_measurements for update
    using (
      exists (
        select 1 from public.project_scopes ps
        where ps.id = project_scope_id
          and ps.organisation_id = public.get_user_organisation_id()
      )
    );

  create policy "Users can delete org scope measurements"
    on public.scope_measurements for delete
    using (
      exists (
        select 1 from public.project_scopes ps
        where ps.id = project_scope_id
          and ps.organisation_id = public.get_user_organisation_id()
      )
    );

  create policy "Users can view org scope photos"
    on public.scope_photos for select
    using (
      exists (
        select 1 from public.project_scopes ps
        where ps.id = project_scope_id
          and ps.organisation_id = public.get_user_organisation_id()
      )
    );

  create policy "Users can create org scope photos"
    on public.scope_photos for insert
    with check (
      exists (
        select 1 from public.project_scopes ps
        where ps.id = project_scope_id
          and ps.organisation_id = public.get_user_organisation_id()
      )
    );

  create policy "Users can delete org scope photos"
    on public.scope_photos for delete
    using (
      exists (
        select 1 from public.project_scopes ps
        where ps.id = project_scope_id
          and ps.organisation_id = public.get_user_organisation_id()
      )
    );

  create policy "Users can view org scope documents"
    on public.scope_documents for select
    using (
      exists (
        select 1 from public.project_scopes ps
        where ps.id = project_scope_id
          and ps.organisation_id = public.get_user_organisation_id()
      )
    );

  create policy "Users can create org scope documents"
    on public.scope_documents for insert
    with check (
      exists (
        select 1 from public.project_scopes ps
        where ps.id = project_scope_id
          and ps.organisation_id = public.get_user_organisation_id()
      )
    );

  create policy "Users can update org scope documents"
    on public.scope_documents for update
    using (
      exists (
        select 1 from public.project_scopes ps
        where ps.id = project_scope_id
          and ps.organisation_id = public.get_user_organisation_id()
      )
    );

  create policy "Users can delete org scope documents"
    on public.scope_documents for delete
    using (
      exists (
        select 1 from public.project_scopes ps
        where ps.id = project_scope_id
          and ps.organisation_id = public.get_user_organisation_id()
      )
    );
end $$;

-- scope_questions / scope_answers
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'project_scopes'
      and column_name = 'organisation_id'
  ) then
    return;
  end if;

  alter table public.scope_questions enable row level security;
  alter table public.scope_answers enable row level security;

  create policy "Users can view org scope questions"
    on public.scope_questions for select
    using (
      exists (
        select 1 from public.project_scopes ps
        where ps.id = project_scope_id
          and ps.organisation_id = public.get_user_organisation_id()
      )
    );

  create policy "Users can create org scope questions"
    on public.scope_questions for insert
    with check (
      exists (
        select 1 from public.project_scopes ps
        where ps.id = project_scope_id
          and ps.organisation_id = public.get_user_organisation_id()
      )
    );

  create policy "Users can update org scope questions"
    on public.scope_questions for update
    using (
      exists (
        select 1 from public.project_scopes ps
        where ps.id = project_scope_id
          and ps.organisation_id = public.get_user_organisation_id()
      )
    );

  create policy "Users can delete org scope questions"
    on public.scope_questions for delete
    using (
      exists (
        select 1 from public.project_scopes ps
        where ps.id = project_scope_id
          and ps.organisation_id = public.get_user_organisation_id()
      )
    );

  create policy "Users can view org scope answers"
    on public.scope_answers for select
    using (
      exists (
        select 1 from public.project_scopes ps
        where ps.id = project_scope_id
          and ps.organisation_id = public.get_user_organisation_id()
      )
    );

  create policy "Users can create org scope answers"
    on public.scope_answers for insert
    with check (
      exists (
        select 1 from public.project_scopes ps
        where ps.id = project_scope_id
          and ps.organisation_id = public.get_user_organisation_id()
      )
    );

  create policy "Users can update org scope answers"
    on public.scope_answers for update
    using (
      exists (
        select 1 from public.project_scopes ps
        where ps.id = project_scope_id
          and ps.organisation_id = public.get_user_organisation_id()
      )
    );

  create policy "Users can delete org scope answers"
    on public.scope_answers for delete
    using (
      exists (
        select 1 from public.project_scopes ps
        where ps.id = project_scope_id
          and ps.organisation_id = public.get_user_organisation_id()
      )
    );
end $$;

-- Future tables CRUD RLS
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'estimate_sections'
      and column_name = 'organisation_id'
  ) then
    alter table public.estimate_sections enable row level security;

    create policy "Users can view org estimate sections"
      on public.estimate_sections for select
      using (organisation_id = public.get_user_organisation_id());

    create policy "Users can create org estimate sections"
      on public.estimate_sections for insert
      with check (organisation_id = public.get_user_organisation_id());

    create policy "Users can update org estimate sections"
      on public.estimate_sections for update
      using (organisation_id = public.get_user_organisation_id());

    create policy "Users can delete org estimate sections"
      on public.estimate_sections for delete
      using (organisation_id = public.get_user_organisation_id());
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'estimate_items'
      and column_name = 'organisation_id'
  ) then
    alter table public.estimate_items enable row level security;

    create policy "Users can view org estimate items"
      on public.estimate_items for select
      using (organisation_id = public.get_user_organisation_id());

    create policy "Users can create org estimate items"
      on public.estimate_items for insert
      with check (organisation_id = public.get_user_organisation_id());

    create policy "Users can update org estimate items"
      on public.estimate_items for update
      using (organisation_id = public.get_user_organisation_id());

    create policy "Users can delete org estimate items"
      on public.estimate_items for delete
      using (organisation_id = public.get_user_organisation_id());
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'rfq_packages'
      and column_name = 'organisation_id'
  ) then
    alter table public.rfq_packages enable row level security;

    create policy "Users can view org rfq packages"
      on public.rfq_packages for select
      using (organisation_id = public.get_user_organisation_id());

    create policy "Users can create org rfq packages"
      on public.rfq_packages for insert
      with check (organisation_id = public.get_user_organisation_id());

    create policy "Users can update org rfq packages"
      on public.rfq_packages for update
      using (organisation_id = public.get_user_organisation_id());

    create policy "Users can delete org rfq packages"
      on public.rfq_packages for delete
      using (organisation_id = public.get_user_organisation_id());
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'ai_scope_runs'
      and column_name = 'organisation_id'
  ) then
    alter table public.ai_scope_runs enable row level security;

    create policy "Users can view org ai scope runs"
      on public.ai_scope_runs for select
      using (organisation_id = public.get_user_organisation_id());

    create policy "Users can create org ai scope runs"
      on public.ai_scope_runs for insert
      with check (organisation_id = public.get_user_organisation_id());

    create policy "Users can update org ai scope runs"
      on public.ai_scope_runs for update
      using (organisation_id = public.get_user_organisation_id());

    create policy "Users can delete org ai scope runs"
      on public.ai_scope_runs for delete
      using (organisation_id = public.get_user_organisation_id());
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Storage buckets and policies (scope media)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values
  ('scope-photos', 'scope-photos', false),
  ('scope-documents', 'scope-documents', false)
on conflict (id) do nothing;

drop policy if exists "Users can view org scope photos storage" on storage.objects;
drop policy if exists "Users can upload org scope photos storage" on storage.objects;
drop policy if exists "Users can delete org scope photos storage" on storage.objects;
drop policy if exists "Users can view org scope documents storage" on storage.objects;
drop policy if exists "Users can upload org scope documents storage" on storage.objects;
drop policy if exists "Users can delete org scope documents storage" on storage.objects;

create policy "Users can view org scope photos storage"
  on storage.objects for select
  using (
    bucket_id = 'scope-photos'
    and (storage.foldername(name))[1] = public.get_user_organisation_id()::text
  );

create policy "Users can upload org scope photos storage"
  on storage.objects for insert
  with check (
    bucket_id = 'scope-photos'
    and (storage.foldername(name))[1] = public.get_user_organisation_id()::text
    and auth.uid() is not null
  );

create policy "Users can delete org scope photos storage"
  on storage.objects for delete
  using (
    bucket_id = 'scope-photos'
    and (storage.foldername(name))[1] = public.get_user_organisation_id()::text
  );

create policy "Users can view org scope documents storage"
  on storage.objects for select
  using (
    bucket_id = 'scope-documents'
    and (storage.foldername(name))[1] = public.get_user_organisation_id()::text
  );

create policy "Users can upload org scope documents storage"
  on storage.objects for insert
  with check (
    bucket_id = 'scope-documents'
    and (storage.foldername(name))[1] = public.get_user_organisation_id()::text
    and auth.uid() is not null
  );

create policy "Users can delete org scope documents storage"
  on storage.objects for delete
  using (
    bucket_id = 'scope-documents'
    and (storage.foldername(name))[1] = public.get_user_organisation_id()::text
  );

-- ---------------------------------------------------------------------------
-- 10. Reload PostgREST schema cache (fixes PGRST205 after rename)
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';
