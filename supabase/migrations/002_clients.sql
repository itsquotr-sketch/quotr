-- Clients table and site visit linkage
-- Run after 001_initial_schema.sql

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  name text not null,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clients_organisation_id_idx on public.clients (organisation_id);

create unique index if not exists clients_org_name_unique_idx
  on public.clients (organisation_id, lower(trim(name)));

alter table public.site_visits
  add column if not exists client_id uuid references public.clients (id) on delete set null;

create index if not exists site_visits_client_id_idx on public.site_visits (client_id);

drop trigger if exists clients_updated_at on public.clients;
create trigger clients_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

alter table public.clients enable row level security;

create policy "Users can view org clients"
  on public.clients for select
  using (organisation_id = public.get_user_organisation_id());

create policy "Users can create org clients"
  on public.clients for insert
  with check (organisation_id = public.get_user_organisation_id());

create policy "Users can update org clients"
  on public.clients for update
  using (organisation_id = public.get_user_organisation_id());

create policy "Users can delete org clients"
  on public.clients for delete
  using (organisation_id = public.get_user_organisation_id());

grant execute on function public.create_organisation_for_user(text) to authenticated;
grant execute on function public.get_user_organisation_id() to authenticated;
