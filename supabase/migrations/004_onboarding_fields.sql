-- Onboarding profile and organisation fields
-- Run if not already applied in Supabase

alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists phone text,
  add column if not exists job_title text;

alter table public.organisations
  add column if not exists trading_name text,
  add column if not exists legal_name text,
  add column if not exists business_type text,
  add column if not exists primary_trade text,
  add column if not exists company_size text,
  add column if not exists quoting_volume text,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists website text,
  add column if not exists city text,
  add column if not exists region text;

-- Comprehensive RPC (replace if you only have the simple version)
create or replace function public.create_organisation_for_user(
  org_name text,
  org_trading_name text,
  org_legal_name text default null,
  org_business_type text default null,
  org_primary_trade text default null,
  org_company_size text default null,
  org_quoting_volume text default null,
  org_phone text default null,
  org_email text default null,
  org_website text default null,
  org_city text default null,
  org_region text default null
)
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

  insert into public.organisations (
    name,
    trading_name,
    legal_name,
    business_type,
    primary_trade,
    company_size,
    quoting_volume,
    phone,
    email,
    website,
    city,
    region
  )
  values (
    org_name,
    org_trading_name,
    org_legal_name,
    org_business_type,
    org_primary_trade,
    org_company_size,
    org_quoting_volume,
    org_phone,
    org_email,
    org_website,
    org_city,
    org_region
  )
  returning id into new_org_id;

  update public.profiles
  set organisation_id = new_org_id
  where id = auth.uid();

  return new_org_id;
end;
$$;

grant execute on function public.create_organisation_for_user(
  text, text, text, text, text, text, text, text, text, text, text, text
) to authenticated;
