-- Project Scope Builder inputs (Phase 1.5)
-- Captures free-form project notes before AI scope generation (Phase 4)

create table if not exists public.project_scope_builder_inputs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  input_type text not null,
  content text not null,
  status text not null default 'saved',
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_scope_builder_inputs_input_type_check check (
    input_type in (
      'typed_note',
      'phone_call_note',
      'site_visit_note',
      'email_paste',
      'voice_transcript',
      'other'
    )
  ),
  constraint project_scope_builder_inputs_status_check check (
    status in ('saved', 'pending', 'processed', 'archived')
  )
);

create index if not exists project_scope_builder_inputs_project_id_idx
  on public.project_scope_builder_inputs (project_id);

create index if not exists project_scope_builder_inputs_organisation_id_idx
  on public.project_scope_builder_inputs (organisation_id);

create index if not exists project_scope_builder_inputs_created_at_idx
  on public.project_scope_builder_inputs (created_at desc);

drop trigger if exists project_scope_builder_inputs_updated_at
  on public.project_scope_builder_inputs;

create trigger project_scope_builder_inputs_updated_at
  before update on public.project_scope_builder_inputs
  for each row execute function public.set_updated_at();

alter table public.project_scope_builder_inputs enable row level security;

create policy "Users can view org scope builder inputs"
  on public.project_scope_builder_inputs for select
  using (organisation_id = public.get_user_organisation_id());

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

create policy "Users can update org scope builder inputs"
  on public.project_scope_builder_inputs for update
  using (organisation_id = public.get_user_organisation_id());

create policy "Users can delete org scope builder inputs"
  on public.project_scope_builder_inputs for delete
  using (organisation_id = public.get_user_organisation_id());
