-- Project Scope Builder suggestions (Phase 1.6)
-- Rule-based draft scope suggestions from project notes

alter table public.project_scopes
  add column if not exists ai_confidence numeric(5, 2),
  add column if not exists confidence_level text,
  add column if not exists is_custom boolean not null default false;

alter table public.project_scopes
  drop constraint if exists project_scopes_confidence_level_check;

alter table public.project_scopes
  add constraint project_scopes_confidence_level_check check (
    confidence_level is null
    or confidence_level in ('high', 'medium', 'low')
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
  updated_at timestamptz not null default now(),
  constraint project_scope_suggestions_status_check check (
    status in ('pending', 'accepted', 'rejected', 'converted')
  ),
  constraint project_scope_suggestions_confidence_check check (
    confidence >= 0 and confidence <= 1
  )
);

create index if not exists project_scope_suggestions_project_id_idx
  on public.project_scope_suggestions (project_id);

create index if not exists project_scope_suggestions_organisation_id_idx
  on public.project_scope_suggestions (organisation_id);

create index if not exists project_scope_suggestions_status_idx
  on public.project_scope_suggestions (status);

create index if not exists project_scope_suggestions_source_input_id_idx
  on public.project_scope_suggestions (source_input_id);

create index if not exists project_scope_suggestions_created_at_idx
  on public.project_scope_suggestions (created_at desc);

create unique index if not exists project_scope_suggestions_pending_unique_idx
  on public.project_scope_suggestions (project_id, suggested_scope_type)
  where status = 'pending';

drop trigger if exists project_scope_suggestions_updated_at
  on public.project_scope_suggestions;

create trigger project_scope_suggestions_updated_at
  before update on public.project_scope_suggestions
  for each row execute function public.set_updated_at();

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
