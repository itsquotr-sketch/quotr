-- Commit to canonical `projects` table and `project_id` foreign keys.
-- Idempotent: safe on databases that already use projects / project_id.

-- Ensure RLS helper exists (001 may not have run on live DBs)
create or replace function public.get_user_organisation_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organisation_id from public.profiles where id = auth.uid();
$$;

grant execute on function public.get_user_organisation_id() to authenticated;

-- 1. Rename jobs -> projects when only jobs exists, or projects is empty
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
    elsif not exists (select 1 from public.projects limit 1) then
      drop table public.projects cascade;
      alter table public.jobs rename to projects;
    end if;
  end if;
end $$;

-- 2. Rename job_id -> project_id on child tables
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'project_scopes',
    'project_scope_builder_inputs',
    'project_scope_suggestions'
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
    end if;
  end loop;
end $$;

-- 3. Recreate policies that referenced public.jobs / job_id
drop policy if exists "Users can create org scope builder inputs"
  on public.project_scope_builder_inputs;

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

drop policy if exists "Users can create org scope suggestions"
  on public.project_scope_suggestions;

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

-- Reload PostgREST schema cache after rename
notify pgrst, 'reload schema';
