-- SAUT AI database setup — part 3 of 3. Paste ALL of this into Supabase → SQL Editor → New query → Run.
-- Run part 1, then 2, then 3 (each in its own query). Safe to re-run parts 2 and 3.

-- ════ 0008_phase1_foundation.sql ════
-- ═══════════════════════════════════════════════════════════════════════════
-- SAUT AI — Phase 1 foundation (ADDITIVE ONLY: no drops of tables/columns/data)
--  • profiles view over users
--  • organization profile fields (contact, language, onboarding state)
--  • updated_at on remaining core tables
--  • role groups for Owner / Admin / Manager / Employee (+ legacy agent/viewer)
--  • create_organization() — atomic onboarding (org + owner + trial)
--  • last-owner protection on memberships
-- ═══════════════════════════════════════════════════════════════════════════

-- ── profiles: the spec's name for the per-user profile (backed by users) ──
create or replace view profiles with (security_invoker = true) as
  select id, email, full_name, phone, locale, platform_role, status, created_at, updated_at from users;

-- ── organization profile ─────────────────────────────────────────────────
alter table organizations add column if not exists contact_email      citext check (contact_email is null or contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');
alter table organizations add column if not exists contact_phone      text   check (contact_phone is null or contact_phone ~ '^\+?[0-9 ]{6,20}$');
alter table organizations add column if not exists address            text   check (char_length(address) <= 300);
alter table organizations add column if not exists preferred_language text   not null default 'ar' check (preferred_language in ('ar', 'en'));
alter table organizations add column if not exists onboarding_completed_at timestamptz;
alter table organizations add column if not exists created_by         uuid references users(id) on delete set null;
-- existing organizations were created through the old onboarding: mark them complete
update organizations set onboarding_completed_at = coalesce(onboarding_completed_at, created_at) where onboarding_completed_at is null;

-- ── updated_at on remaining core tables (append-only logs excluded) ──────
alter table memberships   add column if not exists updated_at timestamptz not null default now();
alter table conversations add column if not exists updated_at timestamptz not null default now();
alter table appointments  add column if not exists updated_at timestamptz not null default now();
do $$ declare t text; begin
  foreach t in array array['memberships','conversations','appointments']
  loop
    execute format('drop trigger if exists trg_%1$s_updated on %1$s', t);
    execute format('create trigger trg_%1$s_updated before update on %1$s for each row execute function set_updated_at()', t);
  end loop;
end $$;
create index if not exists appointments_status_idx on appointments(organization_id, status, starts_at);
create index if not exists customers_name_idx on customers(organization_id, full_name);

-- ── Role groups (single source of truth for policies) ────────────────────
-- manage_org : owner, admin                     → org profile, members, integrations, billing
-- manage_ai  : owner, admin, manager            → AI employees, instructions, tools, automations
-- operate    : owner, admin, manager, employee, agent → customers, conversations, appointments, uploads
-- read       : every member (incl. viewer)
create or replace function can_manage_ai(org uuid) returns boolean
language sql stable security definer set search_path = public as $$ select has_org_role(org, '{owner,admin,manager}') $$;
create or replace function can_operate(org uuid) returns boolean
language sql stable security definer set search_path = public as $$ select has_org_role(org, '{owner,admin,manager,employee,agent}') $$;

-- AI employees: previously writable by owner/admin/agent → now owner/admin/manager
drop policy if exists ai_employees_write on ai_employees;
create policy ai_employees_write on ai_employees for all
  using (can_manage_ai(organization_id)) with check (can_manage_ai(organization_id));

drop policy if exists instr_write on ai_employee_instructions;
create policy instr_write on ai_employee_instructions for all
  using (exists (select 1 from ai_employees e where e.id = employee_id and can_manage_ai(e.organization_id)))
  with check (exists (select 1 from ai_employees e where e.id = employee_id and can_manage_ai(e.organization_id)));

-- Operational tables: employees and managers can work with them
do $$ declare t text; begin
  foreach t in array array['knowledge_documents','customers','conversations','messages','calls','appointments']
  loop
    execute format('drop policy if exists %1$s_write on %1$s', t);
    execute format('create policy %1$s_write on %1$s for all using (can_operate(organization_id)) with check (can_operate(organization_id))', t);
  end loop;
  foreach t in array array['agent_tasks','leads','business_reports']
  loop
    execute format('drop policy if exists %1$s_write on %1$s', t);
    execute format('create policy %1$s_write on %1$s for all using (can_operate(organization_id) and can_access_branch(organization_id, branch_id)) with check (can_operate(organization_id) and can_access_branch(organization_id, branch_id))', t);
  end loop;
  foreach t in array array['agent_memory','agent_executions','workflow_executions','customer_tags','customer_notes','whatsapp_templates']
  loop
    execute format('drop policy if exists %1$s_write on %1$s', t);
    execute format('create policy %1$s_write on %1$s for all using (can_operate(organization_id)) with check (can_operate(organization_id))', t);
  end loop;
end $$;

drop policy if exists ctl_rw on customer_tag_links;
create policy ctl_rw on customer_tag_links for all
  using (exists (select 1 from customers c where c.id = customer_id and is_member(c.organization_id)))
  with check (exists (select 1 from customers c where c.id = customer_id and can_operate(c.organization_id)));

-- Agent configuration + automations: manage_ai
drop policy if exists agent_tools_rw on agent_tools;
drop policy if exists agent_perms_rw on agent_permissions;
create policy agent_tools_rw on agent_tools for all
  using (exists (select 1 from ai_employees e where e.id = agent_id and (is_member(e.organization_id) or is_platform_admin())))
  with check (exists (select 1 from ai_employees e where e.id = agent_id and can_manage_ai(e.organization_id)));
create policy agent_perms_rw on agent_permissions for all
  using (exists (select 1 from ai_employees e where e.id = agent_id and (is_member(e.organization_id) or is_platform_admin())))
  with check (exists (select 1 from ai_employees e where e.id = agent_id and can_manage_ai(e.organization_id)));
drop policy if exists wf_write on workflows;
drop policy if exists wfn_write on workflow_nodes;
create policy wf_write  on workflows      for all using (can_manage_ai(organization_id)) with check (can_manage_ai(organization_id));
create policy wfn_write on workflow_nodes for all using (can_manage_ai(organization_id)) with check (can_manage_ai(organization_id));

-- Knowledge: deleting stays owner/admin/manager
drop policy if exists knowledge_delete on storage.objects;
create policy knowledge_delete on storage.objects for delete using (
  bucket_id = 'knowledge' and can_manage_ai(((storage.foldername(name))[1])::uuid));
drop policy if exists knowledge_write on storage.objects;
create policy knowledge_write on storage.objects for insert with check (
  bucket_id = 'knowledge' and can_operate(((storage.foldername(name))[1])::uuid));

-- ── Last-owner protection ────────────────────────────────────────────────
create or replace function protect_last_owner() returns trigger
language plpgsql security definer set search_path = public as $$
declare remaining int;
begin
  if (tg_op = 'DELETE' and old.role = 'owner') or (tg_op = 'UPDATE' and old.role = 'owner' and new.role <> 'owner') then
    select count(*) into remaining from memberships where organization_id = old.organization_id and role = 'owner' and id <> old.id;
    if remaining = 0 and exists (select 1 from organizations where id = old.organization_id) then
      raise exception 'LAST_OWNER: an organization must keep at least one owner' using errcode = 'P0001';
    end if;
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists trg_protect_last_owner on memberships;
create trigger trg_protect_last_owner before update or delete on memberships
  for each row execute function protect_last_owner();

-- Only owners may grant or change the owner role
create or replace function protect_owner_grant() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.role = 'owner'
     and (tg_op = 'INSERT' or old.role <> 'owner')
     and not has_org_role(new.organization_id, '{owner}')
     and not is_platform_admin()
     -- bootstrap: first member of a brand-new organization
     and exists (select 1 from memberships m where m.organization_id = new.organization_id) then
    raise exception 'Only an owner can grant the owner role' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists trg_protect_owner_grant on memberships;
create trigger trg_protect_owner_grant before insert or update on memberships
  for each row execute function protect_owner_grant();

-- Members may leave an organization themselves (last-owner trigger still applies)
drop policy if exists mem_leave on memberships;
create policy mem_leave on memberships for delete using (user_id = auth.uid());

-- ── Onboarding: create organization atomically ───────────────────────────
create or replace function create_organization(
  p_name text,
  p_country text default 'KW',
  p_industry industry default 'other',
  p_contact_email text default null,
  p_contact_phone text default null,
  p_timezone text default 'Asia/Kuwait',
  p_language text default 'ar',
  p_address text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  org_id uuid;
  base_slug text;
  final_slug text;
  owned int;
  trial jsonb;
  trial_days int;
  plan uuid;
  cur text;
begin
  if uid is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if not exists (select 1 from users where id = uid and status = 'active') then raise exception 'Account is not active' using errcode = '42501'; end if;
  if p_name is null or char_length(trim(p_name)) < 2 or char_length(p_name) > 120 then raise exception 'Business name must be 2–120 characters' using errcode = '22023'; end if;
  if p_country !~ '^[A-Z]{2}$' then raise exception 'Invalid country' using errcode = '22023'; end if;
  if p_language not in ('ar', 'en') then raise exception 'Invalid language' using errcode = '22023'; end if;
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then raise exception 'Invalid timezone' using errcode = '22023'; end if;
  select count(*) into owned from memberships where user_id = uid and role = 'owner';
  if owned >= 5 then raise exception 'Organization limit reached' using errcode = 'P0001'; end if;

  cur := case p_country when 'KW' then 'KWD' when 'SA' then 'SAR' when 'AE' then 'AED' when 'QA' then 'QAR' when 'BH' then 'BHD' when 'OM' then 'OMR' else 'USD' end;
  base_slug := trim(both '-' from regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g'));
  if char_length(base_slug) < 3 then base_slug := 'org'; end if;
  final_slug := left(base_slug, 40) || '-' || substr(md5(gen_random_uuid()::text), 1, 6);

  insert into organizations (name, slug, country, currency, timezone, industry, contact_email, contact_phone, preferred_language, address, created_by, onboarding_completed_at)
  values (trim(p_name), final_slug, p_country, cur, p_timezone, p_industry, nullif(trim(p_contact_email), ''), nullif(trim(p_contact_phone), ''), p_language, nullif(trim(p_address), ''), uid, now())
  returning id into org_id;

  insert into memberships (organization_id, user_id, role) values (org_id, uid, 'owner');

  -- Free trial (no payment involved). Paid plans activate only via verified payment webhooks.
  select value into trial from platform_settings where key = 'trial';
  trial_days := case when coalesce((trial->>'enabled')::boolean, true) then coalesce((trial->>'days')::int, 14) else 0 end;
  select id into plan from subscription_plans where code = 'starter';
  if trial_days > 0 and plan is not null then
    insert into subscriptions (organization_id, plan_id, status, interval, trial_ends_at, current_period_start, current_period_end)
    values (org_id, plan, 'trialing', 'monthly', now() + make_interval(days => trial_days), now(), now() + make_interval(days => trial_days));
  end if;

  update users set locale = p_language where id = uid;
  insert into audit_logs (organization_id, actor_id, action, target_type, target_id, metadata)
  values (org_id, uid, 'organization.created', 'organization', org_id::text, jsonb_build_object('industry', p_industry, 'trial_days', trial_days));
  return org_id;
end $$;
revoke all on function create_organization(text, text, industry, text, text, text, text, text) from public;
grant execute on function create_organization(text, text, industry, text, text, text, text, text) to authenticated;

-- Members may read the profiles of people in their organizations (names in member lists)
drop policy if exists users_org_read on users;
create policy users_org_read on users for select using (
  exists (select 1 from memberships a join memberships b on a.organization_id = b.organization_id
          where a.user_id = auth.uid() and b.user_id = users.id));

-- ════ 0009_phase2_channels_billing.sql ════
-- ════════════════════════════════════════════════════════════════════════════
-- 0009 — Phase 2: billing lifecycle + knowledge processing (additive, re-runnable)
--  • subscriptions.provider_recurring_id — MyFatoorah RecurringId so cancellations
--    actually stop future charges at the provider.
--  • expire_lapsed_subscriptions() — moves subscriptions whose paid period or free
--    trial has ended (with no confirmed renewal) out of the "live" states, and
--    notifies owners. Stripe subscriptions are excluded: Stripe webhooks are their
--    source of truth. Schedule with pg_cron (see docs/DEPLOYMENT.md).
--  • knowledge_documents.error — why a PDF/DOCX could not be read (shown in the UI).
--  • Full-text index matching searchKnowledge() (to_tsvector('simple', content_text)).
-- ════════════════════════════════════════════════════════════════════════════

alter table subscriptions add column if not exists provider_recurring_id text;
create index if not exists subscriptions_period_end_idx on subscriptions(current_period_end) where status in ('trialing', 'active', 'past_due');

create or replace function expire_lapsed_subscriptions(p_grace interval default interval '3 days', p_final interval default interval '10 days')
returns table (subscription_id uuid, organization_id uuid, old_status subscription_status, new_status subscription_status)
language plpgsql security definer set search_path = public as $$
declare r record; next_status subscription_status; msg text;
begin
  for r in
    select s.id, s.organization_id, s.status, s.provider, s.cancel_at_period_end, s.trial_ends_at, s.current_period_end
    from subscriptions s
    where s.status in ('trialing', 'active', 'past_due')
      and (s.provider is distinct from 'stripe')
    for update skip locked
  loop
    next_status := null;
    if r.status = 'trialing' and r.provider is null and coalesce(r.trial_ends_at, r.current_period_end) < now() then
      next_status := 'canceled'; msg := 'Your free trial has ended. Choose a plan to keep your AI employees working.';
    elsif r.status = 'active' and r.current_period_end < now() and r.cancel_at_period_end then
      next_status := 'canceled'; msg := 'Your subscription has ended as requested.';
    elsif r.status = 'active' and r.current_period_end < now() - p_grace then
      next_status := 'past_due'; msg := 'We have not received your renewal payment. Please update your payment to avoid interruption.';
    elsif r.status = 'past_due' and r.current_period_end < now() - p_final then
      next_status := 'canceled'; msg := 'Your subscription was cancelled because the renewal payment was not received.';
    end if;

    if next_status is not null then
      update subscriptions set status = next_status,
             canceled_at = case when next_status = 'canceled' then now() else canceled_at end,
             updated_at = now()
       where id = r.id;
      insert into notifications (organization_id, kind, title, body, link)
      values (r.organization_id, 'billing',
              case next_status when 'canceled' then 'Subscription ended' else 'Payment overdue' end,
              msg, '/dashboard/billing');
      insert into audit_logs (organization_id, action, target_type, target_id, metadata)
      values (r.organization_id, 'subscription.lifecycle', 'subscription', r.id::text,
              jsonb_build_object('from', r.status, 'to', next_status));
      subscription_id := r.id; organization_id := r.organization_id; old_status := r.status; new_status := next_status;
      return next;
    end if;
  end loop;
end $$;

revoke all on function expire_lapsed_subscriptions(interval, interval) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then revoke all on function expire_lapsed_subscriptions(interval, interval) from anon; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then revoke all on function expire_lapsed_subscriptions(interval, interval) from authenticated; end if;
end $$;

-- ── Knowledge processing ────────────────────────────────────────────────────
alter table knowledge_documents add column if not exists error text check (char_length(error) <= 500);
create index if not exists knowledge_documents_fts_idx on knowledge_documents using gin (to_tsvector('simple'::regconfig, content_text));
create index if not exists knowledge_documents_processing_idx on knowledge_documents(created_at) where status = 'processing';
