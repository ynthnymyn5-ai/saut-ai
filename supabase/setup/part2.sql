-- SAUT AI database setup — part 2 of 3. Paste ALL of this into Supabase → SQL Editor → New query → Run.
-- Run part 1, then 2, then 3 (each in its own query). Safe to re-run parts 2 and 3.

-- ════ 0006_operating_system.sql ════
-- ═══════════════════════════════════════════════════════════════════════════
-- SAUT AI — Business Operating System upgrade (ADDITIVE ONLY)
-- No table, column or row from 0001–0004 is dropped or rewritten.
-- `ai_employees` remains the agents table; the `agents` view below exposes it
-- under the new name.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── New enum types ───────────────────────────────────────────────────────
do $$ begin create type agent_role as enum ('receptionist','sales','support','manager','booking','custom'); exception when duplicate_object then null; end $$;
do $$ begin create type live_status as enum ('online','working','listening','thinking','speaking','waiting','needs_attention','offline'); exception when duplicate_object then null; end $$;
do $$ begin create type task_status as enum ('pending','in_progress','needs_confirmation','completed','failed','canceled'); exception when duplicate_object then null; end $$;
do $$ begin create type execution_status as enum ('pending_confirmation','running','succeeded','failed','denied','canceled'); exception when duplicate_object then null; end $$;
do $$ begin create type lead_stage as enum ('new','contacted','interested','qualified','converted','lost'); exception when duplicate_object then null; end $$;
do $$ begin create type workflow_trigger as enum ('call_received','missed_call','whatsapp_message','lead_created','appointment_created','appointment_canceled','complaint','payment_confirmed','ticket_created'); exception when duplicate_object then null; end $$;

-- ── Branches ─────────────────────────────────────────────────────────────
create table if not exists branches (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null check (char_length(name) between 2 and 120),
  name_ar         text check (char_length(name_ar) <= 120),
  address         text check (char_length(address) <= 300),
  phone_number    text check (phone_number ~ '^\+?[0-9 ]{6,20}$'),
  timezone        text not null default 'Asia/Kuwait',
  opening_hours   jsonb not null default '{}',   -- {"sun":[["09:00","22:00"]], ...}
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, name)
);
create index if not exists branches_org_idx on branches(organization_id);

-- Branch-level permissions: members with rows here only see those branches;
-- members with no rows (and all owners/admins) see every branch.
create table if not exists membership_branches (
  membership_id uuid not null references memberships(id) on delete cascade,
  branch_id     uuid not null references branches(id) on delete cascade,
  primary key (membership_id, branch_id)
);

create or replace function can_access_branch(org uuid, branch uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select branch is null
      or is_platform_admin()
      or exists (select 1 from memberships m where m.organization_id = org and m.user_id = auth.uid()
                 and (m.role in ('owner','admin')
                      or not exists (select 1 from membership_branches mb where mb.membership_id = m.id)
                      or exists (select 1 from membership_branches mb where mb.membership_id = m.id and mb.branch_id = branch)));
$$;

-- branch_id on existing operational tables (nullable = applies to whole organization)
alter table ai_employees        add column if not exists branch_id uuid references branches(id) on delete set null;
alter table customers           add column if not exists branch_id uuid references branches(id) on delete set null;
alter table conversations       add column if not exists branch_id uuid references branches(id) on delete set null;
alter table calls               add column if not exists branch_id uuid references branches(id) on delete set null;
alter table appointments        add column if not exists branch_id uuid references branches(id) on delete set null;
alter table knowledge_documents add column if not exists branch_id uuid references branches(id) on delete set null;
create index if not exists ai_employees_branch_idx  on ai_employees(branch_id);
create index if not exists appointments_branch_idx  on appointments(branch_id, starts_at);
create index if not exists calls_branch_idx         on calls(branch_id, started_at desc);

-- ── Agents: extend ai_employees ──────────────────────────────────────────
alter table ai_employees add column if not exists role            agent_role not null default 'receptionist';
alter table ai_employees add column if not exists template_key    text;
alter table ai_employees add column if not exists language        text not null default 'ar' check (language in ('ar','en','ar+en'));
alter table ai_employees add column if not exists speaking_rate   numeric(3,2) not null default 1.00 check (speaking_rate between 0.70 and 1.30);
alter table ai_employees add column if not exists live_status     live_status not null default 'offline';
alter table ai_employees add column if not exists live_detail     text;          -- e.g. "Booking for +965 •••• 0101"
alter table ai_employees add column if not exists live_updated_at timestamptz;
alter table ai_employees add column if not exists safety_profile  text not null default 'standard' check (safety_profile in ('standard','medical','financial'));

create or replace view agents with (security_invoker = true) as
  select id, organization_id, branch_id, name, avatar_url, role, template_key, industry, voice, dialect, language,
         speaking_rate, personality, business_info, tasks, working_hours, call_settings, status,
         live_status, live_detail, live_updated_at, safety_profile, created_at, updated_at
  from ai_employees;

create table if not exists agent_tools (
  agent_id   uuid not null references ai_employees(id) on delete cascade,
  tool_key   text not null check (tool_key ~ '^[a-z_]{3,48}$'),
  enabled    boolean not null default true,
  config     jsonb not null default '{}',
  primary key (agent_id, tool_key)
);

create table if not exists agent_permissions (
  agent_id   uuid not null references ai_employees(id) on delete cascade,
  permission text not null check (permission ~ '^[a-z_]+\.[a-z_]+$'),   -- e.g. customers.write
  effect     text not null check (effect in ('allow','confirm','deny')),
  primary key (agent_id, permission)
);

create table if not exists agent_memory (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  agent_id        uuid references ai_employees(id) on delete cascade,
  customer_id     uuid references customers(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete cascade,
  kind            text not null check (kind in ('fact','preference','summary','context')),
  content         text not null check (char_length(content) <= 2000),
  expires_at      timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists agent_memory_customer_idx on agent_memory(organization_id, customer_id, created_at desc);

create table if not exists agent_tasks (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  branch_id         uuid references branches(id) on delete set null,
  agent_id          uuid references ai_employees(id) on delete set null,
  assigned_user     uuid references users(id) on delete set null,
  parent_task_id    uuid references agent_tasks(id) on delete set null,     -- delegation chain
  conversation_id   uuid references conversations(id) on delete set null,
  customer_id       uuid references customers(id) on delete set null,
  kind              text not null check (kind in ('follow_up','callback','booking','support_case','escalation','report','custom')),
  title             text not null check (char_length(title) between 2 and 200),
  details           text check (char_length(details) <= 5000),
  status            task_status not null default 'pending',
  priority          text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  due_at            timestamptz,
  completed_at      timestamptz,
  created_by_agent  uuid references ai_employees(id) on delete set null,
  created_by_user   uuid references users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists agent_tasks_org_status_idx on agent_tasks(organization_id, status, due_at);

create table if not exists agent_executions (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references organizations(id) on delete cascade,
  agent_id              uuid references ai_employees(id) on delete set null,
  task_id               uuid references agent_tasks(id) on delete set null,
  conversation_id       uuid references conversations(id) on delete set null,
  tool_key              text not null,
  input                 jsonb not null default '{}',
  output                jsonb,
  status                execution_status not null default 'running',
  attempts              int not null default 0 check (attempts between 0 and 10),
  error                 text,
  requires_confirmation boolean not null default false,
  confirmed_by          uuid references users(id),
  confirmed_at          timestamptz,
  test_mode             boolean not null default false,
  started_at            timestamptz not null default now(),
  finished_at           timestamptz,
  duration_ms           int
);
create index if not exists agent_exec_org_idx on agent_executions(organization_id, started_at desc);
create index if not exists agent_exec_pending_idx on agent_executions(organization_id) where status = 'pending_confirmation';

-- ── Conversations: live-ops columns ──────────────────────────────────────
alter table conversations add column if not exists handled_by    text not null default 'ai' check (handled_by in ('ai','human'));
alter table conversations add column if not exists assigned_user uuid references users(id) on delete set null;
alter table conversations add column if not exists escalated_at  timestamptz;
alter table conversations add column if not exists current_task  text;
alter table conversations add column if not exists last_activity_at timestamptz default now();
create index if not exists conversations_live_idx on conversations(organization_id, status, last_activity_at desc);

alter table messages add column if not exists provider_message_id text;
alter table messages add column if not exists delivery_status     text check (delivery_status in ('queued','sent','delivered','read','failed'));
create unique index if not exists messages_provider_id_idx on messages(provider_message_id) where provider_message_id is not null;

-- ── Automation Studio ────────────────────────────────────────────────────
create table if not exists workflows (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  branch_id       uuid references branches(id) on delete set null,
  name            text not null check (char_length(name) between 2 and 120),
  description     text check (char_length(description) <= 1000),
  trigger         workflow_trigger not null,
  enabled         boolean not null default false,
  version         int not null default 1,
  template_key    text,
  created_by      uuid references users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists workflows_trigger_idx on workflows(organization_id, trigger) where enabled;

create table if not exists workflow_nodes (
  id              uuid primary key default gen_random_uuid(),
  workflow_id     uuid not null references workflows(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  key             text not null check (key ~ '^[a-z0-9_-]{1,40}$'),
  kind            text not null check (kind in ('condition','action')),
  type            text not null check (type ~ '^[a-z_]{3,48}$'),
  config          jsonb not null default '{}',
  parent_key      text,                       -- condition this node hangs off
  branch          text check (branch in ('yes','no')),
  position        int not null default 0,
  unique (workflow_id, key)
);

create table if not exists workflow_executions (
  id              uuid primary key default gen_random_uuid(),
  workflow_id     uuid not null references workflows(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  trigger_event   jsonb not null default '{}',
  status          text not null default 'running' check (status in ('running','succeeded','failed','skipped','waiting_confirmation')),
  steps           jsonb not null default '[]',
  error           text,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz
);
create index if not exists wf_exec_idx on workflow_executions(organization_id, started_at desc);

-- ── CRM ──────────────────────────────────────────────────────────────────
create table if not exists leads (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  branch_id         uuid references branches(id) on delete set null,
  customer_id       uuid not null references customers(id) on delete cascade,
  agent_id          uuid references ai_employees(id) on delete set null,
  owner_user        uuid references users(id) on delete set null,
  source            text not null default 'phone' check (source in ('phone','whatsapp','web_chat','email','manual','import')),
  stage             lead_stage not null default 'new',
  score             int not null default 0 check (score between 0 and 100),
  score_reasons     jsonb not null default '[]',
  interest          text check (char_length(interest) <= 500),
  estimated_value   numeric(12,3) check (estimated_value >= 0),
  lost_reason       text,
  next_follow_up_at timestamptz,
  stage_changed_at  timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists leads_pipeline_idx on leads(organization_id, stage, score desc);

create table if not exists customer_tags (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 30),
  color           text not null default 'violet' check (color in ('violet','blue','green','amber','red','gray')),
  unique (organization_id, name)
);
create table if not exists customer_tag_links (
  customer_id uuid not null references customers(id) on delete cascade,
  tag_id      uuid not null references customer_tags(id) on delete cascade,
  primary key (customer_id, tag_id)
);
-- copy existing text[] tags into the normalized tables (column is kept)
insert into customer_tags (organization_id, name)
  select distinct organization_id, unnest(tags) from customers where array_length(tags, 1) > 0
  on conflict do nothing;
insert into customer_tag_links (customer_id, tag_id)
  select c.id, t.id from customers c cross join lateral unnest(c.tags) tg(name)
  join customer_tags t on t.organization_id = c.organization_id and t.name = tg.name
  on conflict do nothing;

create table if not exists customer_notes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  customer_id     uuid not null references customers(id) on delete cascade,
  author_user     uuid references users(id) on delete set null,
  author_agent    uuid references ai_employees(id) on delete set null,
  body            text not null check (char_length(body) between 1 and 5000),
  created_at      timestamptz not null default now()
);
create index if not exists customer_notes_idx on customer_notes(customer_id, created_at desc);
-- carry over the legacy single notes field once
insert into customer_notes (organization_id, customer_id, body)
  select organization_id, id, notes from customers c
  where notes is not null and length(trim(notes)) > 0
    and not exists (select 1 from customer_notes n where n.customer_id = c.id);

-- ── Business intelligence, notifications, WhatsApp, add-ons ──────────────
create table if not exists business_reports (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  branch_id       uuid references branches(id) on delete set null,
  question        text check (char_length(question) <= 500),
  kind            text not null default 'question' check (kind in ('question','monthly','weekly','agent_performance')),
  period_start    date not null,
  period_end      date not null,
  measured        jsonb not null default '{}',    -- computed from the database
  estimated       jsonb not null default '{}',    -- derived with stated formulas
  interpretation  text,                            -- AI-generated, labelled in UI
  model           text,
  created_by      uuid references users(id),
  created_at      timestamptz not null default now()
);
create index if not exists business_reports_idx on business_reports(organization_id, created_at desc);

create table if not exists notifications (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id         uuid references users(id) on delete cascade,      -- null = all owners/admins
  kind            text not null check (kind in ('escalation','confirmation','usage','task','workflow_failed','integration','billing','lead')),
  title           text not null check (char_length(title) <= 200),
  body            text check (char_length(body) <= 1000),
  link            text check (link ~ '^/'),
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists notifications_idx on notifications(organization_id, created_at desc) where read_at is null;

create table if not exists whatsapp_templates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null check (name ~ '^[a-z0-9_]{1,512}$'),
  language        text not null default 'ar',
  category        text not null check (category in ('utility','marketing','authentication')),
  status          text not null default 'pending' check (status in ('pending','approved','rejected','paused')),
  body            text not null check (char_length(body) <= 1024),
  provider_id     text,
  updated_at      timestamptz not null default now(),
  unique (organization_id, name, language)
);

alter table customers add column if not exists whatsapp_opt_in    boolean not null default false;
alter table customers add column if not exists whatsapp_last_inbound_at timestamptz;   -- 24-hour service window

create table if not exists subscription_addons (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  kind            text not null check (kind in ('extra_employee','voice_minutes','messages')),
  quantity        int not null check (quantity > 0),
  unit_price      numeric(10,3) not null check (unit_price >= 0),
  currency        text not null default 'KWD',
  status          text not null default 'pending' check (status in ('pending','active','canceled')),   -- active ONLY via verified webhook
  provider        payment_provider,
  provider_ref    text,
  period_end      timestamptz,
  created_at      timestamptz not null default now()
);

create table if not exists usage_alerts (
  organization_id uuid not null references organizations(id) on delete cascade,
  metric          text not null,
  threshold       int not null,
  period_start    date not null,
  sent_at         timestamptz not null default now(),
  primary key (organization_id, metric, threshold, period_start)
);

alter table subscription_plans add column if not exists is_custom_pricing boolean not null default false;
insert into subscription_plans (code, name_en, name_ar, currency, price_monthly, price_annual, max_employees, monthly_voice_minutes, monthly_conversations, max_locations, sort_order, is_custom_pricing, features)
values ('enterprise','Enterprise','المؤسسات','KWD',0,0,100,20000,200000,50,4,true,
  '["Unlimited branches by agreement","Custom AI employees & integrations","Dedicated success manager","SLA and security review"]')
on conflict (code) do nothing;

insert into platform_settings (key, value) values
  ('addon_prices', '{"extra_employee": 9, "voice_minutes_500": 12, "messages_2000": 5}'),
  ('usage_alert_thresholds', '[80, 100]'),
  ('provider_costs', '{"voice_per_min_usd": 0.06, "llm_per_1k_tokens_usd": 0.0006, "whatsapp_per_msg_usd": 0.03, "usd_to_kwd": 0.307}')
on conflict (key) do nothing;

-- ── updated_at triggers for new tables ───────────────────────────────────
do $$ declare t text; begin
  foreach t in array array['branches','agent_tasks','workflows','leads']
  loop
    execute format('drop trigger if exists trg_%1$s_updated on %1$s', t);
    execute format('create trigger trg_%1$s_updated before update on %1$s for each row execute function set_updated_at()', t);
  end loop;
end $$;

-- ── Plan limits include active add-ons ───────────────────────────────────
create or replace function enforce_employee_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim int; extra int; cnt int;
begin
  select p.max_employees into lim from subscriptions s join subscription_plans p on p.id = s.plan_id
  where s.organization_id = new.organization_id and s.status in ('trialing','active','past_due') limit 1;
  select coalesce(sum(quantity), 0) into extra from subscription_addons
  where organization_id = new.organization_id and kind = 'extra_employee' and status = 'active';
  select count(*) into cnt from ai_employees where organization_id = new.organization_id;
  if cnt >= coalesce(lim, 1) + extra then
    raise exception 'PLAN_LIMIT: your plan allows % AI employee(s)', coalesce(lim, 1) + extra using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ── Plan limit for branches ──────────────────────────────────────────────
create or replace function enforce_branch_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim int; cnt int;
begin
  select p.max_locations into lim from subscriptions s join subscription_plans p on p.id = s.plan_id
  where s.organization_id = new.organization_id and s.status in ('trialing','active','past_due') limit 1;
  select count(*) into cnt from branches where organization_id = new.organization_id;
  if cnt >= coalesce(lim, 1) then raise exception 'PLAN_LIMIT: your plan allows % branch(es)', coalesce(lim, 1) using errcode = 'P0001'; end if;
  return new;
end $$;
drop trigger if exists trg_branch_limit on branches;
create trigger trg_branch_limit before insert on branches for each row execute function enforce_branch_limit();

-- ── Row-level security ───────────────────────────────────────────────────
alter table branches            enable row level security;
alter table membership_branches enable row level security;
alter table agent_tools         enable row level security;
alter table agent_permissions   enable row level security;
alter table agent_memory        enable row level security;
alter table agent_tasks         enable row level security;
alter table agent_executions    enable row level security;
alter table workflows           enable row level security;
alter table workflow_nodes      enable row level security;
alter table workflow_executions enable row level security;
alter table leads               enable row level security;
alter table customer_tags       enable row level security;
alter table customer_tag_links  enable row level security;
alter table customer_notes      enable row level security;
alter table business_reports    enable row level security;
alter table notifications       enable row level security;
alter table whatsapp_templates  enable row level security;
alter table subscription_addons enable row level security;
alter table usage_alerts        enable row level security;

-- Branch-aware read/write for operational tables
do $$ declare t text; begin
  foreach t in array array['agent_tasks','leads','business_reports']
  loop
    execute format('drop policy if exists %1$s_read on %1$s', t);
    execute format('drop policy if exists %1$s_write on %1$s', t);
    execute format('create policy %1$s_read on %1$s for select using ((is_member(organization_id) and can_access_branch(organization_id, branch_id)) or is_platform_admin())', t);
    execute format($p$create policy %1$s_write on %1$s for all
      using (has_org_role(organization_id, '{owner,admin,agent}') and can_access_branch(organization_id, branch_id))
      with check (has_org_role(organization_id, '{owner,admin,agent}') and can_access_branch(organization_id, branch_id))$p$, t);
  end loop;
  -- org-scoped tables without branch
  foreach t in array array['agent_memory','agent_executions','workflow_executions','customer_tags','customer_notes','whatsapp_templates']
  loop
    execute format('drop policy if exists %1$s_read on %1$s', t);
    execute format('drop policy if exists %1$s_write on %1$s', t);
    execute format('create policy %1$s_read on %1$s for select using (is_member(organization_id) or is_platform_admin())', t);
    execute format($p$create policy %1$s_write on %1$s for all using (has_org_role(organization_id, '{owner,admin,agent}')) with check (has_org_role(organization_id, '{owner,admin,agent}'))$p$, t);
  end loop;
end $$;

-- Tighten existing branch-capable tables: replace read policies with branch-aware ones
do $$ declare t text; begin
  foreach t in array array['ai_employees','customers','conversations','calls','appointments','knowledge_documents']
  loop
    execute format('drop policy if exists %1$s_read on %1$s', t);
    execute format('create policy %1$s_read on %1$s for select using ((is_member(organization_id) and can_access_branch(organization_id, branch_id)) or is_platform_admin())', t);
  end loop;
end $$;

drop policy if exists branches_read on branches;
drop policy if exists branches_write on branches;
create policy branches_read  on branches for select using ((is_member(organization_id) and can_access_branch(organization_id, id)) or is_platform_admin());
create policy branches_write on branches for all using (has_org_role(organization_id, '{owner,admin}')) with check (has_org_role(organization_id, '{owner,admin}'));

drop policy if exists mb_rw on membership_branches;
create policy mb_rw on membership_branches for all
  using (exists (select 1 from memberships m where m.id = membership_id and (m.user_id = auth.uid() or has_org_role(m.organization_id, '{owner,admin}'))))
  with check (exists (select 1 from memberships m where m.id = membership_id and has_org_role(m.organization_id, '{owner,admin}')));

-- Agent configuration: owner/admin only (agents can't grant themselves permissions)
drop policy if exists agent_tools_rw on agent_tools;
drop policy if exists agent_perms_rw on agent_permissions;
create policy agent_tools_rw on agent_tools for all
  using (exists (select 1 from ai_employees e where e.id = agent_id and (is_member(e.organization_id) or is_platform_admin())))
  with check (exists (select 1 from ai_employees e where e.id = agent_id and has_org_role(e.organization_id, '{owner,admin}')));
create policy agent_perms_rw on agent_permissions for all
  using (exists (select 1 from ai_employees e where e.id = agent_id and (is_member(e.organization_id) or is_platform_admin())))
  with check (exists (select 1 from ai_employees e where e.id = agent_id and has_org_role(e.organization_id, '{owner,admin}')));

drop policy if exists wf_read on workflows;
drop policy if exists wf_write on workflows;
create policy wf_read  on workflows for select using (is_member(organization_id) or is_platform_admin());
create policy wf_write on workflows for all using (has_org_role(organization_id, '{owner,admin}')) with check (has_org_role(organization_id, '{owner,admin}'));
drop policy if exists wfn_read on workflow_nodes;
drop policy if exists wfn_write on workflow_nodes;
create policy wfn_read  on workflow_nodes for select using (is_member(organization_id) or is_platform_admin());
create policy wfn_write on workflow_nodes for all using (has_org_role(organization_id, '{owner,admin}')) with check (has_org_role(organization_id, '{owner,admin}'));

drop policy if exists ctl_rw on customer_tag_links;
create policy ctl_rw on customer_tag_links for all
  using (exists (select 1 from customers c where c.id = customer_id and is_member(c.organization_id)))
  with check (exists (select 1 from customers c where c.id = customer_id and has_org_role(c.organization_id, '{owner,admin,agent}')));

drop policy if exists notif_read on notifications;
drop policy if exists notif_update on notifications;
create policy notif_read   on notifications for select using ((user_id = auth.uid()) or (user_id is null and has_org_role(organization_id, '{owner,admin}')));
create policy notif_update on notifications for update using ((user_id = auth.uid()) or (user_id is null and has_org_role(organization_id, '{owner,admin}')));

drop policy if exists addons_read on subscription_addons;
create policy addons_read on subscription_addons for select using (has_org_role(organization_id, '{owner,admin}') or is_platform_admin());
drop policy if exists usage_alerts_read on usage_alerts;
create policy usage_alerts_read on usage_alerts for select using (is_member(organization_id));

-- ── Retention: extend purge to the new data ──────────────────────────────
create or replace function purge_expired_conversations() returns int
language plpgsql security definer set search_path = public as $$
declare n int; m int;
begin
  delete from conversations c using organizations o
  where c.organization_id = o.id and c.started_at < now() - make_interval(days => o.retention_days);
  get diagnostics n = row_count;
  delete from agent_memory where expires_at is not null and expires_at < now();
  delete from agent_memory a using organizations o
  where a.organization_id = o.id and a.created_at < now() - make_interval(days => o.retention_days);
  delete from workflow_executions w using organizations o
  where w.organization_id = o.id and w.started_at < now() - make_interval(days => greatest(o.retention_days, 30));
  delete from agent_executions e using organizations o
  where e.organization_id = o.id and e.started_at < now() - make_interval(days => greatest(o.retention_days, 30));
  get diagnostics m = row_count;
  return n + m;
end $$;

-- ── Admin views ──────────────────────────────────────────────────────────
create or replace view admin_usage_by_org with (security_invoker = true) as
select u.organization_id, o.name, u.metric, date_trunc('month', u.period_start)::date as month, sum(u.quantity) as quantity
from usage_records u join organizations o on o.id = u.organization_id
group by 1, 2, 3, 4;

create or replace view admin_failed_integrations with (security_invoker = true) as
select i.organization_id, o.name, i.provider, i.status, i.last_error, i.updated_at
from integrations i join organizations o on o.id = i.organization_id
where i.status = 'error';

-- ════ 0007_member_roles.sql ════
-- Phase 1 roles: Owner, Admin, Manager, Employee.
-- 'agent' and 'viewer' stay valid (existing rows keep working):
--   agent  → treated like employee
--   viewer → read-only
-- New enum values must be committed before use, so they live in their own migration.
alter type member_role add value if not exists 'manager';
alter type member_role add value if not exists 'employee';
