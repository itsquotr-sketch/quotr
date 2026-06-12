-- Sprint 9A: Simpler constraint persistence (selected true/false per project)

create table if not exists public.project_constraint_selections (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  quick_estimate_id uuid references public.quick_estimates (id) on delete set null,
  constraint_key text not null,
  label text not null,
  selected boolean not null,
  metadata jsonb not null default '{}',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_constraint_selections_project_key_unique
    unique (project_id, constraint_key)
);

create index if not exists project_constraint_selections_organisation_id_idx
  on public.project_constraint_selections (organisation_id);

create index if not exists project_constraint_selections_project_id_idx
  on public.project_constraint_selections (project_id);

create index if not exists project_constraint_selections_quick_estimate_id_idx
  on public.project_constraint_selections (quick_estimate_id);

drop trigger if exists project_constraint_selections_updated_at
  on public.project_constraint_selections;
create trigger project_constraint_selections_updated_at
  before update on public.project_constraint_selections
  for each row execute function public.set_updated_at();

alter table public.project_constraint_selections enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'project_constraint_selections'
      and policyname = 'Users can view org project constraint selections'
  ) then
    create policy "Users can view org project constraint selections"
      on public.project_constraint_selections for select
      using (organisation_id = public.get_user_organisation_id());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'project_constraint_selections'
      and policyname = 'Users can create org project constraint selections'
  ) then
    create policy "Users can create org project constraint selections"
      on public.project_constraint_selections for insert
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
      and tablename = 'project_constraint_selections'
      and policyname = 'Users can update org project constraint selections'
  ) then
    create policy "Users can update org project constraint selections"
      on public.project_constraint_selections for update
      using (organisation_id = public.get_user_organisation_id());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'project_constraint_selections'
      and policyname = 'Users can delete org project constraint selections'
  ) then
    create policy "Users can delete org project constraint selections"
      on public.project_constraint_selections for delete
      using (organisation_id = public.get_user_organisation_id());
  end if;
end $$;

-- Migrate existing constraint rows from project_estimate_driver_values
insert into public.project_constraint_selections (
  organisation_id,
  project_id,
  quick_estimate_id,
  constraint_key,
  label,
  selected,
  metadata,
  created_at,
  updated_at
)
select
  v.organisation_id,
  v.project_id,
  v.quick_estimate_id,
  v.constraint_key,
  coalesce(v.constraint_key, 'unknown'),
  coalesce((v.value->>'selected')::boolean, true),
  coalesce(v.value, '{}'::jsonb),
  v.created_at,
  v.updated_at
from public.project_estimate_driver_values v
where v.constraint_key is not null
on conflict (project_id, constraint_key) do update
set
  selected = excluded.selected,
  metadata = excluded.metadata,
  quick_estimate_id = excluded.quick_estimate_id,
  updated_at = excluded.updated_at;

notify pgrst, 'reload schema';
