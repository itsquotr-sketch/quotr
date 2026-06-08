-- Align live `jobs` schema with canonical project model
-- Safe to run on databases that already use jobs + job_id FKs

-- Optional denormalized client fields (display speed; clients table remains source of truth)
alter table public.jobs
  add column if not exists client_name text,
  add column if not exists client_phone text,
  add column if not exists client_email text,
  add column if not exists quote_status text not null default 'not_started',
  add column if not exists initial_notes text;

-- Scope columns used by the app (may already exist in some environments)
alter table public.project_scopes
  add column if not exists notes text,
  add column if not exists ai_confidence numeric(5, 2),
  add column if not exists estimate_status text not null default 'not_started',
  add column if not exists is_custom boolean not null default false;

-- Future rename path: when ready, rename jobs -> projects and job_id -> project_id
-- Do not run automatically — requires coordinated app deploy.
