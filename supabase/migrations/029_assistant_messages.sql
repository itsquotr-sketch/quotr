-- Assistant V2 persistent chat thread

create table if not exists public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  role text not null,
  content text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  constraint assistant_messages_role_check
    check (role in ('user', 'assistant', 'system'))
);

create index if not exists assistant_messages_project_id_idx
  on public.assistant_messages (project_id, created_at);

create index if not exists assistant_messages_organisation_id_idx
  on public.assistant_messages (organisation_id);

alter table public.assistant_messages enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'assistant_messages'
      and policyname = 'Users can view org assistant messages'
  ) then
    create policy "Users can view org assistant messages"
      on public.assistant_messages for select
      using (organisation_id = public.get_user_organisation_id());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'assistant_messages'
      and policyname = 'Users can create org assistant messages'
  ) then
    create policy "Users can create org assistant messages"
      on public.assistant_messages for insert
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
      and tablename = 'assistant_messages'
      and policyname = 'Users can delete org assistant messages'
  ) then
    create policy "Users can delete org assistant messages"
      on public.assistant_messages for delete
      using (organisation_id = public.get_user_organisation_id());
  end if;
end $$;
