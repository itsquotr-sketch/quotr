-- Align projects schema with canonical application model
-- Safe on databases using either projects or legacy jobs (pre-012 repair)

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'projects'
  ) then
    alter table public.projects
      add column if not exists client_name text,
      add column if not exists client_phone text,
      add column if not exists client_email text,
      add column if not exists quote_status text not null default 'not_started',
      add column if not exists initial_notes text,
      add column if not exists enquiry_status text not null default 'new',
      add column if not exists description text,
      add column if not exists job_type text;
  elsif exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'jobs'
  ) then
    alter table public.jobs
      add column if not exists client_name text,
      add column if not exists client_phone text,
      add column if not exists client_email text,
      add column if not exists quote_status text not null default 'not_started',
      add column if not exists initial_notes text,
      add column if not exists enquiry_status text not null default 'new',
      add column if not exists description text,
      add column if not exists job_type text;
  end if;
end $$;

-- Scope columns used by the app
alter table public.project_scopes
  add column if not exists notes text,
  add column if not exists ai_confidence numeric(5, 2),
  add column if not exists estimate_status text not null default 'not_started',
  add column if not exists is_custom boolean not null default false;
