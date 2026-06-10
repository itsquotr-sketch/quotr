-- Idempotent safety net if migration 020 was not applied yet

alter table public.scope_answers
  add column if not exists source text not null default 'user';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'scope_answers_source_check'
  ) then
    alter table public.scope_answers
      add constraint scope_answers_source_check
      check (source in ('user', 'notes', 'discovery'));
  end if;
end $$;

-- Dedupe answers before adding unique index
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

create unique index if not exists scope_answers_question_unique_idx
  on public.scope_answers (scope_question_id);

notify pgrst, 'reload schema';
