-- scope_answers.organisation_id required for org-scoped RLS and inserts

alter table public.scope_answers
  add column if not exists organisation_id uuid references public.organisations (id) on delete cascade;

update public.scope_answers sa
set organisation_id = ps.organisation_id
from public.project_scopes ps
where sa.project_scope_id = ps.id
  and sa.organisation_id is null;

do $$
begin
  if not exists (
    select 1 from public.scope_answers where organisation_id is null
  ) then
    alter table public.scope_answers
      alter column organisation_id set not null;
  end if;
end $$;

create index if not exists scope_answers_organisation_id_idx
  on public.scope_answers (organisation_id);

notify pgrst, 'reload schema';
