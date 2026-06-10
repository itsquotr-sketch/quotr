-- Sprint 2A: Finalize projects/project_id naming and complete RLS gaps.
-- Run after 009 and 010. Idempotent where possible.

-- Ensure RLS helper exists
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

-- ---------------------------------------------------------------------------
-- 1. Ensure `projects` is the only top-level table (drop orphaned `jobs`)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'jobs'
  ) and exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'projects'
  ) then
    if not exists (select 1 from public.jobs limit 1) then
      drop table public.jobs cascade;
    end if;
  elsif exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'jobs'
  ) then
    alter table public.jobs rename to projects;
  end if;
end $$;

-- Rename any remaining job_id columns
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

-- ---------------------------------------------------------------------------
-- 2. scope_questions — full CRUD RLS
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 3. scope_answers — full CRUD RLS
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 4. scope_measurements — add missing update policy
-- ---------------------------------------------------------------------------
create policy "Users can update org scope measurements"
  on public.scope_measurements for update
  using (
    exists (
      select 1 from public.project_scopes ps
      where ps.id = project_scope_id
        and ps.organisation_id = public.get_user_organisation_id()
    )
  );

-- ---------------------------------------------------------------------------
-- 5. scope_documents — add missing update policy
-- ---------------------------------------------------------------------------
create policy "Users can update org scope documents"
  on public.scope_documents for update
  using (
    exists (
      select 1 from public.project_scopes ps
      where ps.id = project_scope_id
        and ps.organisation_id = public.get_user_organisation_id()
    )
  );
