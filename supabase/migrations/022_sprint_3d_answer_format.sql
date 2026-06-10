-- Sprint 3D: answer upsert safety, discovery source, composite unique index

-- Allow discovery as answer source (notes kept for backward compatibility)
alter table public.scope_answers drop constraint if exists scope_answers_source_check;

alter table public.scope_answers
  add constraint scope_answers_source_check
  check (source in ('user', 'notes', 'discovery'));

-- Dedupe before adding composite unique index
delete from public.scope_answers sa
where sa.id in (
  select sa2.id
  from public.scope_answers sa2
  inner join (
    select scope_question_id, min(created_at) as min_created
    from public.scope_answers
    group by scope_question_id
    having count(*) > 1
  ) dups
    on sa2.scope_question_id = dups.scope_question_id
    and sa2.created_at > dups.min_created
);

create unique index if not exists scope_answers_scope_question_unique_idx
  on public.scope_answers (project_scope_id, scope_question_id);

create unique index if not exists scope_answers_question_unique_idx
  on public.scope_answers (scope_question_id);

notify pgrst, 'reload schema';
