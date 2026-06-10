-- Align scope_questions with application schema (fixes PGRST204 on missing `question` column).
-- Safe for live DBs that used question_text or were missing base columns.

-- Rename legacy question_text → question
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'scope_questions'
      and column_name = 'question_text'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'scope_questions'
      and column_name = 'question'
  ) then
    alter table public.scope_questions
      rename column question_text to question;
  end if;
end $$;

-- Base columns (idempotent)
alter table public.scope_questions
  add column if not exists question text,
  add column if not exists organisation_id uuid references public.organisations (id) on delete cascade,
  add column if not exists question_key text,
  add column if not exists question_type text default 'text',
  add column if not exists options jsonb,
  add column if not exists unit text,
  add column if not exists sort_order integer default 0,
  add column if not exists created_at timestamptz default now();

-- Backfill question text from available sources
update public.scope_questions
set question = coalesce(
  nullif(trim(question), ''),
  nullif(trim(question_key), ''),
  'Scope question'
)
where question is null or trim(question) = '';

update public.scope_questions
set question_type = 'text'
where question_type is null;

update public.scope_questions sq
set organisation_id = ps.organisation_id
from public.project_scopes ps
where sq.project_scope_id = ps.id
  and sq.organisation_id is null;

-- Enforce not null where data allows
do $$
begin
  if not exists (
    select 1 from public.scope_questions
    where question is null or trim(question) = ''
  ) then
    alter table public.scope_questions
      alter column question set not null;
  end if;

  alter table public.scope_questions
    alter column question_type set default 'text';

  if not exists (
    select 1 from public.scope_questions where question_type is null
  ) then
    alter table public.scope_questions
      alter column question_type set not null;
  end if;
end $$;

create index if not exists scope_questions_organisation_id_idx
  on public.scope_questions (organisation_id);

create index if not exists scope_questions_scope_key_idx
  on public.scope_questions (project_scope_id, question_key)
  where question_key is not null;

-- Refresh PostgREST schema cache (Supabase API)
notify pgrst, 'reload schema';
