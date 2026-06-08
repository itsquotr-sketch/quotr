-- Projects, scopes and capture tables
-- Run after 002_clients.sql

-- Extend clients with email
alter table public.clients
  add column if not exists email text;

-- Projects / opportunities
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

create index if not exists projects_organisation_id_idx on public.projects (organisation_id);
create index if not exists projects_created_at_idx on public.projects (created_at desc);
create index if not exists projects_status_idx on public.projects (status);

-- Scope types (system + org-specific)
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

create index if not exists scope_types_organisation_id_idx on public.scope_types (organisation_id);

-- Project scopes of work
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

create index if not exists project_scopes_project_id_idx on public.project_scopes (project_id);
create index if not exists project_scopes_organisation_id_idx on public.project_scopes (organisation_id);

-- Scope measurements
create table if not exists public.scope_measurements (
  id uuid primary key default gen_random_uuid(),
  project_scope_id uuid not null references public.project_scopes (id) on delete cascade,
  label text not null,
  value text not null,
  unit text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists scope_measurements_scope_id_idx
  on public.scope_measurements (project_scope_id);

-- Scope photos
create table if not exists public.scope_photos (
  id uuid primary key default gen_random_uuid(),
  project_scope_id uuid not null references public.project_scopes (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists scope_photos_scope_id_idx on public.scope_photos (project_scope_id);

-- Scope documents
create table if not exists public.scope_documents (
  id uuid primary key default gen_random_uuid(),
  project_scope_id uuid not null references public.project_scopes (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  created_at timestamptz not null default now()
);

create index if not exists scope_documents_scope_id_idx on public.scope_documents (project_scope_id);

-- Scope AI questions (foundation for future AI)
create table if not exists public.scope_questions (
  id uuid primary key default gen_random_uuid(),
  project_scope_id uuid not null references public.project_scopes (id) on delete cascade,
  question text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists scope_questions_scope_id_idx on public.scope_questions (project_scope_id);

-- Scope answers
create table if not exists public.scope_answers (
  id uuid primary key default gen_random_uuid(),
  scope_question_id uuid not null references public.scope_questions (id) on delete cascade,
  project_scope_id uuid not null references public.project_scopes (id) on delete cascade,
  answer text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scope_answers_scope_id_idx on public.scope_answers (project_scope_id);

-- Future estimate / RFQ / AI tables (project_scope_id links only)
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

-- Updated_at triggers
drop trigger if exists projects_updated_at on public.projects;
create trigger projects_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

drop trigger if exists project_scopes_updated_at on public.project_scopes;
create trigger project_scopes_updated_at
  before update on public.project_scopes
  for each row execute function public.set_updated_at();

drop trigger if exists scope_answers_updated_at on public.scope_answers;
create trigger scope_answers_updated_at
  before update on public.scope_answers
  for each row execute function public.set_updated_at();

-- Seed default scope types (system-wide)
insert into public.scope_types (organisation_id, name, slug, description, sort_order)
values
  (null, 'Bathroom renovation', 'bathroom-renovation', 'Bathroom upgrade or full renovation', 1),
  (null, 'Kitchen renovation', 'kitchen-renovation', 'Kitchen upgrade or full renovation', 2),
  (null, 'Deck', 'deck', 'New deck or deck replacement', 3),
  (null, 'Internal alteration', 'internal-alteration', 'Internal layout or structural changes', 4),
  (null, 'Roofing', 'roofing', 'Roof repair or replacement', 5),
  (null, 'Landscaping', 'landscaping', 'Outdoor landscaping works', 6),
  (null, 'Electrical', 'electrical', 'Electrical works and fit-off', 7),
  (null, 'Plumbing', 'plumbing', 'Plumbing works and fit-off', 8),
  (null, 'Painting', 'painting', 'Interior or exterior painting', 9),
  (null, 'Fencing', 'fencing', 'New fencing or fence replacement', 10),
  (null, 'Other', 'other', 'Custom scope of work', 99)
on conflict do nothing;

-- RLS
alter table public.projects enable row level security;
alter table public.scope_types enable row level security;
alter table public.project_scopes enable row level security;
alter table public.scope_measurements enable row level security;
alter table public.scope_photos enable row level security;
alter table public.scope_documents enable row level security;
alter table public.scope_questions enable row level security;
alter table public.scope_answers enable row level security;
alter table public.estimate_sections enable row level security;
alter table public.estimate_items enable row level security;
alter table public.rfq_packages enable row level security;
alter table public.ai_scope_runs enable row level security;

-- Projects
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

-- Scope types: system (null org) + own org
create policy "Users can view scope types"
  on public.scope_types for select
  using (
    organisation_id is null
    or organisation_id = public.get_user_organisation_id()
  );

create policy "Users can create org scope types"
  on public.scope_types for insert
  with check (organisation_id = public.get_user_organisation_id());

-- Project scopes
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

-- Scope child tables (via project_scopes org check)
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

create policy "Users can delete org scope documents"
  on public.scope_documents for delete
  using (
    exists (
      select 1 from public.project_scopes ps
      where ps.id = project_scope_id
        and ps.organisation_id = public.get_user_organisation_id()
    )
  );

create policy "Users can view org scope questions"
  on public.scope_questions for select
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

-- Future tables RLS (org-scoped)
create policy "Users can view org estimate sections"
  on public.estimate_sections for select
  using (organisation_id = public.get_user_organisation_id());

create policy "Users can view org estimate items"
  on public.estimate_items for select
  using (organisation_id = public.get_user_organisation_id());

create policy "Users can view org rfq packages"
  on public.rfq_packages for select
  using (organisation_id = public.get_user_organisation_id());

create policy "Users can view org ai scope runs"
  on public.ai_scope_runs for select
  using (organisation_id = public.get_user_organisation_id());

-- Storage buckets for scope media
insert into storage.buckets (id, name, public)
values
  ('scope-photos', 'scope-photos', false),
  ('scope-documents', 'scope-documents', false)
on conflict (id) do nothing;

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
