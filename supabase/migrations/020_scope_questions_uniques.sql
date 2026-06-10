-- Sprint 3C: dedupe scope questions/answers and enforce uniqueness

-- Migrate legacy question_key values to namespaced keys
update public.scope_questions set question_key = 'deck.area_m2' where question_key = 'deck_area';
update public.scope_questions set question_key = 'deck.level_type' where question_key = 'elevated';
update public.scope_questions set question_key = 'deck.material_type' where question_key = 'deck_material';
update public.scope_questions set question_key = 'deck.has_stairs' where question_key = 'stairs';
update public.scope_questions set question_key = 'deck.has_balustrade' where question_key = 'balustrade';
update public.scope_questions set question_key = 'deck.has_pergola' where question_key = 'pergola';
update public.scope_questions set question_key = 'retaining_wall.length_m' where question_key = 'wall_length';
update public.scope_questions set question_key = 'retaining_wall.height_m' where question_key = 'wall_height';
update public.scope_questions set question_key = 'retaining_wall.has_drainage' where question_key = 'drainage';
update public.scope_questions set question_key = 'retaining_wall.has_backfill' where question_key = 'backfill';
update public.scope_questions set question_key = 'retaining_wall.machine_access' where question_key = 'machine_access';
update public.scope_questions set question_key = 'retaining_wall.has_spoil_removal' where question_key = 'spoil_removal';
update public.scope_questions set question_key = 'retaining_wall.carting_distance_m' where question_key = 'carting_distance';
update public.scope_questions set question_key = 'bathroom.floor_area_m2' where question_key = 'floor_area';
update public.scope_questions set question_key = 'bathroom.layout_changing' where question_key = 'layout_same';
update public.scope_questions set question_key = 'bathroom.fixtures_client_supplied' where question_key = 'fixtures_client';
update public.scope_questions set question_key = 'bathroom.tile_height' where question_key = 'tiling_height';
update public.scope_questions set question_key = 'bathroom.waterproofing_included' where question_key = 'waterproofing';
update public.scope_questions set question_key = 'bathroom.rubbish_removal' where question_key = 'rubbish_removal';

-- Remove duplicate questions (keep oldest per scope + key)
delete from public.scope_answers sa
using public.scope_questions sq
where sa.scope_question_id = sq.id
  and sq.id in (
    select sq2.id
    from public.scope_questions sq2
    inner join (
      select project_scope_id, question_key, min(created_at) as min_created
      from public.scope_questions
      where question_key is not null
      group by project_scope_id, question_key
      having count(*) > 1
    ) dups
      on sq2.project_scope_id = dups.project_scope_id
      and sq2.question_key = dups.question_key
      and sq2.created_at > dups.min_created
  );

delete from public.scope_questions sq
where sq.id in (
  select sq2.id
  from public.scope_questions sq2
  inner join (
    select project_scope_id, question_key, min(created_at) as min_created
    from public.scope_questions
    where question_key is not null
    group by project_scope_id, question_key
    having count(*) > 1
  ) dups
    on sq2.project_scope_id = dups.project_scope_id
    and sq2.question_key = dups.question_key
    and sq2.created_at > dups.min_created
);

-- Dedupe scope_answers per question (keep oldest)
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

-- Answer source for prefilled-from-notes tracking
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
      check (source in ('user', 'notes'));
  end if;
end $$;

create unique index if not exists scope_questions_scope_key_unique_idx
  on public.scope_questions (project_scope_id, question_key)
  where question_key is not null;

create unique index if not exists scope_answers_question_unique_idx
  on public.scope_answers (scope_question_id);

notify pgrst, 'reload schema';
