-- Sprint 3B: scope_questions metadata for answerable Project Assistant questions

alter table public.scope_questions
  add column if not exists organisation_id uuid references public.organisations (id) on delete cascade,
  add column if not exists question_key text,
  add column if not exists question_type text not null default 'text',
  add column if not exists options jsonb,
  add column if not exists unit text;

update public.scope_questions sq
set organisation_id = ps.organisation_id
from public.project_scopes ps
where sq.project_scope_id = ps.id
  and sq.organisation_id is null;

create index if not exists scope_questions_organisation_id_idx
  on public.scope_questions (organisation_id);

create index if not exists scope_questions_scope_key_idx
  on public.scope_questions (project_scope_id, question_key)
  where question_key is not null;
