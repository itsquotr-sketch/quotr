-- Full CRUD RLS for future estimate / RFQ / AI tables (audit #4)

-- estimate_sections
create policy "Users can create org estimate sections"
  on public.estimate_sections for insert
  with check (organisation_id = public.get_user_organisation_id());

create policy "Users can update org estimate sections"
  on public.estimate_sections for update
  using (organisation_id = public.get_user_organisation_id());

create policy "Users can delete org estimate sections"
  on public.estimate_sections for delete
  using (organisation_id = public.get_user_organisation_id());

-- estimate_items
create policy "Users can create org estimate items"
  on public.estimate_items for insert
  with check (organisation_id = public.get_user_organisation_id());

create policy "Users can update org estimate items"
  on public.estimate_items for update
  using (organisation_id = public.get_user_organisation_id());

create policy "Users can delete org estimate items"
  on public.estimate_items for delete
  using (organisation_id = public.get_user_organisation_id());

-- rfq_packages
create policy "Users can create org rfq packages"
  on public.rfq_packages for insert
  with check (organisation_id = public.get_user_organisation_id());

create policy "Users can update org rfq packages"
  on public.rfq_packages for update
  using (organisation_id = public.get_user_organisation_id());

create policy "Users can delete org rfq packages"
  on public.rfq_packages for delete
  using (organisation_id = public.get_user_organisation_id());

-- ai_scope_runs
create policy "Users can create org ai scope runs"
  on public.ai_scope_runs for insert
  with check (organisation_id = public.get_user_organisation_id());

create policy "Users can update org ai scope runs"
  on public.ai_scope_runs for update
  using (organisation_id = public.get_user_organisation_id());

create policy "Users can delete org ai scope runs"
  on public.ai_scope_runs for delete
  using (organisation_id = public.get_user_organisation_id());
