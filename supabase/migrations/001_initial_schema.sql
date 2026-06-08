-- Quotr initial schema
-- Run this in the Supabase SQL editor

-- Organisations
create table if not exists public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Profiles (linked to auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  organisation_id uuid references public.organisations (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Site visits
create table if not exists public.site_visits (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  title text not null,
  client_name text not null,
  client_phone text,
  site_address text not null,
  job_type text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists site_visits_organisation_id_idx on public.site_visits (organisation_id);
create index if not exists site_visits_created_at_idx on public.site_visits (created_at desc);

-- Site visit measurements
create table if not exists public.site_visit_measurements (
  id uuid primary key default gen_random_uuid(),
  site_visit_id uuid not null references public.site_visits (id) on delete cascade,
  label text not null,
  value text not null,
  unit text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists site_visit_measurements_site_visit_id_idx
  on public.site_visit_measurements (site_visit_id);

-- Site visit photos
create table if not exists public.site_visit_photos (
  id uuid primary key default gen_random_uuid(),
  site_visit_id uuid not null references public.site_visits (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists site_visit_photos_site_visit_id_idx
  on public.site_visit_photos (site_visit_id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists organisations_updated_at on public.organisations;
create trigger organisations_updated_at
  before update on public.organisations
  for each row execute function public.set_updated_at();

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists site_visits_updated_at on public.site_visits;
create trigger site_visits_updated_at
  before update on public.site_visits
  for each row execute function public.set_updated_at();

-- Helper: get current user's organisation_id
create or replace function public.get_user_organisation_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organisation_id from public.profiles where id = auth.uid();
$$;

-- Onboarding: create organisation and link to current user
create or replace function public.create_organisation_for_user(org_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if exists (
    select 1 from public.profiles
    where id = auth.uid() and organisation_id is not null
  ) then
    raise exception 'User already belongs to an organisation';
  end if;

  insert into public.organisations (name)
  values (org_name)
  returning id into new_org_id;

  update public.profiles
  set organisation_id = new_org_id
  where id = auth.uid();

  return new_org_id;
end;
$$;

-- RLS
alter table public.organisations enable row level security;
alter table public.profiles enable row level security;
alter table public.site_visits enable row level security;
alter table public.site_visit_measurements enable row level security;
alter table public.site_visit_photos enable row level security;

-- Organisations: users can read/update their own org, insert when onboarding
create policy "Users can view their organisation"
  on public.organisations for select
  using (id = public.get_user_organisation_id());

create policy "Users can create an organisation"
  on public.organisations for insert
  with check (auth.uid() is not null);

create policy "Users can update their organisation"
  on public.organisations for update
  using (id = public.get_user_organisation_id());

-- Profiles: users can read/update their own profile
create policy "Users can view their own profile"
  on public.profiles for select
  using (id = auth.uid());

create policy "Users can update their own profile"
  on public.profiles for update
  using (id = auth.uid());

-- Site visits
create policy "Users can view org site visits"
  on public.site_visits for select
  using (organisation_id = public.get_user_organisation_id());

create policy "Users can create org site visits"
  on public.site_visits for insert
  with check (
    organisation_id = public.get_user_organisation_id()
    and created_by = auth.uid()
  );

create policy "Users can update org site visits"
  on public.site_visits for update
  using (organisation_id = public.get_user_organisation_id());

create policy "Users can delete org site visits"
  on public.site_visits for delete
  using (organisation_id = public.get_user_organisation_id());

-- Site visit measurements
create policy "Users can view org measurements"
  on public.site_visit_measurements for select
  using (
    exists (
      select 1 from public.site_visits sv
      where sv.id = site_visit_id
        and sv.organisation_id = public.get_user_organisation_id()
    )
  );

create policy "Users can create org measurements"
  on public.site_visit_measurements for insert
  with check (
    exists (
      select 1 from public.site_visits sv
      where sv.id = site_visit_id
        and sv.organisation_id = public.get_user_organisation_id()
    )
  );

create policy "Users can delete org measurements"
  on public.site_visit_measurements for delete
  using (
    exists (
      select 1 from public.site_visits sv
      where sv.id = site_visit_id
        and sv.organisation_id = public.get_user_organisation_id()
    )
  );

-- Site visit photos
create policy "Users can view org photos"
  on public.site_visit_photos for select
  using (
    exists (
      select 1 from public.site_visits sv
      where sv.id = site_visit_id
        and sv.organisation_id = public.get_user_organisation_id()
    )
  );

create policy "Users can create org photos"
  on public.site_visit_photos for insert
  with check (
    exists (
      select 1 from public.site_visits sv
      where sv.id = site_visit_id
        and sv.organisation_id = public.get_user_organisation_id()
    )
  );

create policy "Users can delete org photos"
  on public.site_visit_photos for delete
  using (
    exists (
      select 1 from public.site_visits sv
      where sv.id = site_visit_id
        and sv.organisation_id = public.get_user_organisation_id()
    )
  );

-- Storage bucket for site photos
insert into storage.buckets (id, name, public)
values ('site-photos', 'site-photos', false)
on conflict (id) do nothing;

-- Storage policies: org-scoped paths like {org_id}/{visit_id}/{filename}
create policy "Users can view org site photos"
  on storage.objects for select
  using (
    bucket_id = 'site-photos'
    and (storage.foldername(name))[1] = public.get_user_organisation_id()::text
  );

create policy "Users can upload org site photos"
  on storage.objects for insert
  with check (
    bucket_id = 'site-photos'
    and (storage.foldername(name))[1] = public.get_user_organisation_id()::text
    and auth.uid() is not null
  );

create policy "Users can delete org site photos"
  on storage.objects for delete
  using (
    bucket_id = 'site-photos'
    and (storage.foldername(name))[1] = public.get_user_organisation_id()::text
  );

grant execute on function public.create_organisation_for_user(text) to authenticated;
grant execute on function public.get_user_organisation_id() to authenticated;
