-- SAUT AI database setup — part 1 of 3. Paste ALL of this into Supabase → SQL Editor → New query → Run.
-- Run part 1, then 2, then 3 (each in its own query). Safe to re-run parts 2 and 3.

-- ════ 0001_schema.sql ════
-- ═══════════════════════════════════════════════════════════════════════════
-- SAUT AI — core schema (PostgreSQL / Supabase)
-- Multi-tenant: every business row belongs to an organization. Row-level
-- security limits access to members of that organization; platform admins
-- (users.platform_role = 'admin') can read everything.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ── Enums ────────────────────────────────────────────────────────────────
create type platform_role       as enum ('user', 'admin');
create type member_role         as enum ('owner', 'admin', 'agent', 'viewer');
create type account_status      as enum ('active', 'suspended');
create type plan_code           as enum ('starter', 'business', 'pro');
create type billing_interval    as enum ('monthly', 'annual');
create type subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'incomplete', 'paused');
create type payment_provider    as enum ('stripe', 'myfatoorah');
create type payment_status      as enum ('pending', 'succeeded', 'failed', 'refunded');
create type employee_status     as enum ('draft', 'testing', 'active', 'paused');
create type dialect             as enum ('kuwaiti', 'saudi', 'emirati', 'msa', 'english');
create type industry            as enum ('restaurant', 'clinic', 'real_estate', 'online_store', 'beauty_salon', 'hotel', 'customer_support', 'other');
create type channel             as enum ('phone', 'whatsapp', 'web_chat', 'email', 'test');
create type conversation_status as enum ('active', 'completed', 'transferred', 'abandoned');
create type message_role        as enum ('customer', 'ai', 'human', 'system');
create type call_status         as enum ('queued', 'ringing', 'in_progress', 'completed', 'busy', 'no_answer', 'failed', 'canceled', 'transferred');
create type appointment_status  as enum ('pending', 'confirmed', 'canceled', 'completed', 'no_show');
create type integration_status  as enum ('disconnected', 'pending', 'connected', 'error');
create type ticket_status       as enum ('open', 'in_progress', 'waiting', 'resolved', 'closed');
create type ticket_priority     as enum ('low', 'normal', 'high', 'urgent');
create type doc_status          as enum ('uploaded', 'processing', 'ready', 'failed');

-- ── Helpers ──────────────────────────────────────────────────────────────
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ── users (profile mirror of auth.users) ─────────────────────────────────
create table users (
  id             uuid primary key references auth.users(id) on delete cascade,
  email          citext not null unique,
  full_name      text check (char_length(full_name) <= 120),
  phone          text check (phone ~ '^\+?[0-9 ]{6,20}$'),
  locale         text not null default 'ar' check (locale in ('ar', 'en')),
  platform_role  platform_role not null default 'user',
  status         account_status not null default 'active',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ── organizations ────────────────────────────────────────────────────────
create table organizations (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null check (char_length(name) between 2 and 120),
  slug                  citext not null unique check (slug ~ '^[a-z0-9-]{3,48}$'),
  country               text not null default 'KW' check (country ~ '^[A-Z]{2}$'),
  currency              text not null default 'KWD' check (currency ~ '^[A-Z]{3}$'),
  timezone              text not null default 'Asia/Kuwait',
  industry              industry not null default 'other',
  status                account_status not null default 'active',
  -- privacy controls
  recording_enabled     boolean not null default false,
  recording_consent_msg text default 'This call may be recorded to improve service quality.',
  retention_days        int not null default 90 check (retention_days between 1 and 3650),
  is_demo               boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ── memberships ──────────────────────────────────────────────────────────
create table memberships (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id         uuid not null references users(id) on delete cascade,
  role            member_role not null default 'agent',
  created_at      timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index on memberships(user_id);

-- RLS helpers (security definer so policies don't recurse)
create or replace function is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from users where id = auth.uid() and platform_role = 'admin' and status = 'active');
$$;

create or replace function is_member(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where organization_id = org and user_id = auth.uid());
$$;

create or replace function has_org_role(org uuid, roles member_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where organization_id = org and user_id = auth.uid() and role = any(roles));
$$;

-- ── subscription_plans ───────────────────────────────────────────────────
create table subscription_plans (
  id                   uuid primary key default gen_random_uuid(),
  code                 plan_code not null unique,
  name_en              text not null,
  name_ar              text not null,
  currency             text not null default 'KWD',
  price_monthly        numeric(10,3) not null check (price_monthly >= 0),   -- KWD uses 3 decimals (fils)
  price_annual         numeric(10,3) not null check (price_annual >= 0),
  max_employees        int not null check (max_employees > 0),
  monthly_voice_minutes int not null check (monthly_voice_minutes >= 0),
  monthly_conversations int not null check (monthly_conversations >= 0),
  max_locations        int not null default 1,
  features             jsonb not null default '[]',
  stripe_price_monthly text,
  stripe_price_annual  text,
  trial_days           int not null default 14 check (trial_days between 0 and 90),
  is_active            boolean not null default true,
  sort_order           int not null default 0,
  updated_at           timestamptz not null default now()
);

-- ── subscriptions ────────────────────────────────────────────────────────
create table subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references organizations(id) on delete cascade,
  plan_id                uuid not null references subscription_plans(id),
  status                 subscription_status not null default 'incomplete',
  interval               billing_interval not null default 'monthly',
  provider               payment_provider,
  provider_subscription_id text unique,
  provider_customer_id   text,
  trial_ends_at          timestamptz,
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  canceled_at            timestamptz,
  coupon_code            text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create unique index one_live_subscription_per_org on subscriptions(organization_id)
  where status in ('trialing', 'active', 'past_due');
create index on subscriptions(status);

-- ── payments (written ONLY by verified provider webhooks) ────────────────
create table payments (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations(id) on delete cascade,
  subscription_id     uuid references subscriptions(id) on delete set null,
  provider            payment_provider not null,
  provider_payment_id text not null,
  amount              numeric(12,3) not null check (amount >= 0),
  currency            text not null,
  status              payment_status not null default 'pending',
  method              text,                -- card, knet, apple_pay, google_pay
  receipt_url         text,
  raw_event_id        text,
  paid_at             timestamptz,
  created_at          timestamptz not null default now(),
  unique (provider, provider_payment_id)
);
create index on payments(organization_id, created_at desc);

-- ── coupons ──────────────────────────────────────────────────────────────
create table coupons (
  id               uuid primary key default gen_random_uuid(),
  code             citext not null unique check (code ~ '^[A-Za-z0-9_-]{3,32}$'),
  percent_off      int check (percent_off between 1 and 100),
  amount_off       numeric(10,3) check (amount_off > 0),
  max_redemptions  int,
  times_redeemed   int not null default 0,
  expires_at       timestamptz,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  check ((percent_off is null) <> (amount_off is null))
);

-- ── platform_settings (admin-configurable, e.g. trial length) ────────────
create table platform_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id)
);

-- ── ai_employees ─────────────────────────────────────────────────────────
create table ai_employees (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 60),
  avatar_url       text,
  industry         industry not null default 'other',
  voice            text not null default 'alloy',
  dialect          dialect not null default 'kuwaiti',
  languages        text[] not null default '{ar,en}',
  personality      jsonb not null default '{"warmth":70,"formality":50,"pace":50,"tone":"friendly"}',
  business_info    jsonb not null default '{}',
  tasks            text[] not null default '{answer_faq}',
  working_hours    jsonb not null default '{"tz":"Asia/Kuwait","days":{}}',
  call_settings    jsonb not null default '{"max_duration_sec":600,"transfer_number":null,"after_hours":"take_message"}',
  phone_number     text,
  status           employee_status not null default 'draft',
  activated_at     timestamptz,
  created_by       uuid references users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on ai_employees(organization_id);
create unique index on ai_employees(phone_number) where phone_number is not null;

-- ── ai_employee_instructions (versioned system prompts) ──────────────────
create table ai_employee_instructions (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references ai_employees(id) on delete cascade,
  version      int not null default 1,
  content      text not null check (char_length(content) <= 20000),
  is_current   boolean not null default true,
  created_by   uuid references users(id),
  created_at   timestamptz not null default now(),
  unique (employee_id, version)
);
create unique index one_current_instruction on ai_employee_instructions(employee_id) where is_current;

-- ── knowledge_documents ──────────────────────────────────────────────────
create table knowledge_documents (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  employee_id     uuid references ai_employees(id) on delete set null,
  title           text not null check (char_length(title) <= 200),
  source_type     text not null check (source_type in ('file', 'text', 'url', 'faq')),
  storage_path    text,
  mime_type       text check (mime_type in ('application/pdf','text/plain','text/markdown','text/csv',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  size_bytes      bigint check (size_bytes <= 20 * 1024 * 1024),
  content_text    text,
  status          doc_status not null default 'uploaded',
  created_by      uuid references users(id),
  created_at      timestamptz not null default now()
);
create index on knowledge_documents(organization_id);

-- ── customers (CRM) ──────────────────────────────────────────────────────
create table customers (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  full_name       text check (char_length(full_name) <= 120),
  phone           text check (phone ~ '^\+?[0-9 ]{6,20}$'),
  email           citext,
  preferred_lang  text check (preferred_lang in ('ar', 'en')),
  tags            text[] not null default '{}',
  notes           text check (char_length(notes) <= 5000),
  marketing_consent boolean not null default false,
  last_contact_at timestamptz,
  is_demo         boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, phone)
);
create index on customers using gin(tags);
create index on customers(organization_id, last_contact_at desc);

-- ── conversations / messages ─────────────────────────────────────────────
create table conversations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  employee_id     uuid references ai_employees(id) on delete set null,
  customer_id     uuid references customers(id) on delete set null,
  channel         channel not null,
  status          conversation_status not null default 'active',
  summary         text,
  sentiment       text check (sentiment in ('positive', 'neutral', 'negative')),
  intent          text,
  transferred_to  text,
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  expires_at      timestamptz           -- set from organization retention policy
);
create index on conversations(organization_id, started_at desc);
create index on conversations(customer_id);

create table messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references conversations(id) on delete cascade,
  organization_id  uuid not null references organizations(id) on delete cascade,
  role             message_role not null,
  content          text not null check (char_length(content) <= 10000),
  tool_call        jsonb,
  tokens           int,
  created_at       timestamptz not null default now()
);
create index on messages(conversation_id, created_at);

-- ── calls ────────────────────────────────────────────────────────────────
create table calls (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  employee_id      uuid references ai_employees(id) on delete set null,
  conversation_id  uuid references conversations(id) on delete set null,
  customer_id      uuid references customers(id) on delete set null,
  provider         text not null default 'twilio',
  provider_call_sid text unique,
  direction        text not null default 'inbound' check (direction in ('inbound', 'outbound')),
  from_number      text,
  to_number        text,
  status           call_status not null default 'queued',
  duration_sec     int check (duration_sec >= 0),
  recording_url    text,
  recording_consent boolean not null default false,
  started_at       timestamptz not null default now(),
  ended_at         timestamptz
);
create index on calls(organization_id, started_at desc);
create index on calls(status);

-- ── appointments ─────────────────────────────────────────────────────────
create table appointments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  customer_id     uuid references customers(id) on delete set null,
  employee_id     uuid references ai_employees(id) on delete set null,
  conversation_id uuid references conversations(id) on delete set null,
  kind            text not null default 'appointment' check (kind in ('appointment', 'reservation', 'viewing', 'callback')),
  starts_at       timestamptz not null,
  ends_at         timestamptz,
  party_size      int check (party_size between 1 and 100),
  status          appointment_status not null default 'pending',
  notes           text,
  external_event_id text,
  created_at      timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create index on appointments(organization_id, starts_at);

-- ── integrations ─────────────────────────────────────────────────────────
create table integrations (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  provider         text not null check (provider in ('whatsapp','telephony','google_calendar','crm','web_widget','email','webhooks','api')),
  status           integration_status not null default 'disconnected',
  config           jsonb not null default '{}',     -- non-secret settings only
  secret_ref       text,                            -- reference to a vault secret, never the secret itself
  connected_at     timestamptz,
  last_error       text,
  updated_at       timestamptz not null default now(),
  unique (organization_id, provider)
);

-- ── api_keys (customer API access; only a hash is stored) ────────────────
create table api_keys (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,
  prefix          text not null,
  key_hash        text not null unique,
  last_used_at    timestamptz,
  revoked_at      timestamptz,
  created_at      timestamptz not null default now()
);

-- ── usage_records ────────────────────────────────────────────────────────
create table usage_records (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  employee_id     uuid references ai_employees(id) on delete set null,
  metric          text not null check (metric in ('voice_seconds','conversations','ai_tokens','whatsapp_messages')),
  quantity        bigint not null check (quantity >= 0),
  period_start    date not null,
  recorded_at     timestamptz not null default now()
);
create index on usage_records(organization_id, metric, period_start);

-- ── support_tickets ──────────────────────────────────────────────────────
create table support_tickets (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  opened_by       uuid references users(id) on delete set null,
  subject         text not null check (char_length(subject) between 3 and 200),
  body            text not null check (char_length(body) <= 10000),
  status          ticket_status not null default 'open',
  priority        ticket_priority not null default 'normal',
  assigned_to     uuid references users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on support_tickets(status, priority);

-- ── audit_logs (append-only) ─────────────────────────────────────────────
create table audit_logs (
  id              bigint generated always as identity primary key,
  organization_id uuid references organizations(id) on delete set null,
  actor_id        uuid references users(id) on delete set null,
  action          text not null,
  target_type     text,
  target_id       text,
  metadata        jsonb not null default '{}',
  ip              inet,
  created_at      timestamptz not null default now()
);
create index on audit_logs(organization_id, created_at desc);

-- ── updated_at triggers ──────────────────────────────────────────────────
do $$ declare t text; begin
  foreach t in array array['users','organizations','subscriptions','ai_employees','customers','integrations','support_tickets','subscription_plans']
  loop execute format('create trigger trg_%1$s_updated before update on %1$s for each row execute function set_updated_at()', t);
  end loop;
end $$;

-- ── New auth user → profile row ──────────────────────────────────────────
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into users (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ── Plan-limit enforcement for AI employees ──────────────────────────────
create or replace function enforce_employee_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim int; cnt int;
begin
  select p.max_employees into lim
  from subscriptions s join subscription_plans p on p.id = s.plan_id
  where s.organization_id = new.organization_id and s.status in ('trialing','active','past_due')
  limit 1;
  if lim is null then lim := 1; end if;
  select count(*) into cnt from ai_employees where organization_id = new.organization_id;
  if cnt >= lim then raise exception 'PLAN_LIMIT: your plan allows % AI employee(s)', lim using errcode = 'P0001'; end if;
  return new;
end $$;
create trigger trg_employee_limit before insert on ai_employees
  for each row execute function enforce_employee_limit();

-- ── Users may not escalate their own platform role or status ─────────────
create or replace function protect_user_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() and (new.platform_role <> old.platform_role or new.status <> old.status) then
    raise exception 'Not allowed';
  end if;
  return new;
end $$;
create trigger trg_protect_user_columns before update on users
  for each row execute function protect_user_columns();

-- ════ 0002_rls.sql ════
-- ═══════════════════════════════════════════════════════════════════════════
-- Row-level security. Default deny: every table has RLS on, and access is
-- granted only by the policies below. Webhooks use the service-role key,
-- which bypasses RLS, and are verified by signature before any write.
-- ═══════════════════════════════════════════════════════════════════════════

alter table users                    enable row level security;
alter table organizations            enable row level security;
alter table memberships              enable row level security;
alter table subscription_plans       enable row level security;
alter table subscriptions            enable row level security;
alter table payments                 enable row level security;
alter table coupons                  enable row level security;
alter table platform_settings        enable row level security;
alter table ai_employees             enable row level security;
alter table ai_employee_instructions enable row level security;
alter table knowledge_documents      enable row level security;
alter table customers                enable row level security;
alter table conversations            enable row level security;
alter table messages                 enable row level security;
alter table calls                    enable row level security;
alter table appointments             enable row level security;
alter table integrations             enable row level security;
alter table api_keys                 enable row level security;
alter table usage_records            enable row level security;
alter table support_tickets          enable row level security;
alter table audit_logs               enable row level security;

-- users
create policy users_self_read   on users for select using (id = auth.uid() or is_platform_admin());
create policy users_self_update on users for update using (id = auth.uid() or is_platform_admin());

-- organizations
create policy org_read   on organizations for select using (is_member(id) or is_platform_admin());
create policy org_insert on organizations for insert with check (auth.uid() is not null);
create policy org_update on organizations for update using (has_org_role(id, '{owner,admin}') or is_platform_admin());
create policy org_delete on organizations for delete using (has_org_role(id, '{owner}'));

-- memberships
create policy mem_read  on memberships for select using (user_id = auth.uid() or is_member(organization_id) or is_platform_admin());
create policy mem_write on memberships for all
  using (has_org_role(organization_id, '{owner,admin}') or is_platform_admin())
  with check (has_org_role(organization_id, '{owner,admin}') or is_platform_admin());
-- bootstrap: the creator of a brand-new org may add themselves as owner
create policy mem_bootstrap on memberships for insert with check (
  user_id = auth.uid() and role = 'owner'
  and not exists (select 1 from memberships m where m.organization_id = memberships.organization_id)
);

-- plans are public to read, admin-only to change
create policy plans_read  on subscription_plans for select using (is_active or is_platform_admin());
create policy plans_admin on subscription_plans for all using (is_platform_admin()) with check (is_platform_admin());

-- subscriptions & payments: members read; only service role (webhooks) or admins write
create policy subs_read  on subscriptions for select using (is_member(organization_id) or is_platform_admin());
create policy subs_admin on subscriptions for all using (is_platform_admin()) with check (is_platform_admin());
create policy pay_read   on payments      for select using (has_org_role(organization_id, '{owner,admin}') or is_platform_admin());

create policy coupons_admin  on coupons           for all using (is_platform_admin()) with check (is_platform_admin());
create policy settings_read  on platform_settings for select using (true);
create policy settings_admin on platform_settings for all using (is_platform_admin()) with check (is_platform_admin());

-- Org-scoped business tables: members read, owner/admin/agent write
do $$ declare t text; begin
  foreach t in array array['ai_employees','knowledge_documents','customers','conversations','messages','calls','appointments']
  loop
    execute format('create policy %1$s_read on %1$s for select using (is_member(organization_id) or is_platform_admin())', t);
    execute format($p$create policy %1$s_write on %1$s for all
      using (has_org_role(organization_id, '{owner,admin,agent}'))
      with check (has_org_role(organization_id, '{owner,admin,agent}'))$p$, t);
  end loop;
end $$;

create policy instr_read on ai_employee_instructions for select using (
  exists (select 1 from ai_employees e where e.id = employee_id and (is_member(e.organization_id) or is_platform_admin())));
create policy instr_write on ai_employee_instructions for all using (
  exists (select 1 from ai_employees e where e.id = employee_id and has_org_role(e.organization_id, '{owner,admin}')))
  with check (
  exists (select 1 from ai_employees e where e.id = employee_id and has_org_role(e.organization_id, '{owner,admin}')));

-- integrations & API keys: owner/admin only
create policy integ_read  on integrations for select using (is_member(organization_id) or is_platform_admin());
create policy integ_write on integrations for all using (has_org_role(organization_id, '{owner,admin}')) with check (has_org_role(organization_id, '{owner,admin}'));
create policy keys_rw     on api_keys     for all using (has_org_role(organization_id, '{owner,admin}')) with check (has_org_role(organization_id, '{owner,admin}'));

-- usage: read-only for members (written by server)
create policy usage_read on usage_records for select using (is_member(organization_id) or is_platform_admin());

-- support tickets
create policy tickets_read   on support_tickets for select using (is_member(organization_id) or opened_by = auth.uid() or is_platform_admin());
create policy tickets_create on support_tickets for insert with check (opened_by = auth.uid() and (organization_id is null or is_member(organization_id)));
create policy tickets_admin  on support_tickets for update using (is_platform_admin());

-- audit logs: read by org owners/admins and platform admins; inserts only via server (service role)
create policy audit_read on audit_logs for select using (
  (organization_id is not null and has_org_role(organization_id, '{owner,admin}')) or is_platform_admin());

-- ── Storage: private knowledge bucket, files stored under <org_id>/... ───
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('knowledge', 'knowledge', false, 20971520,
  array['application/pdf','text/plain','text/markdown','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;

create policy knowledge_read on storage.objects for select using (
  bucket_id = 'knowledge' and is_member(((storage.foldername(name))[1])::uuid));
create policy knowledge_write on storage.objects for insert with check (
  bucket_id = 'knowledge' and has_org_role(((storage.foldername(name))[1])::uuid, '{owner,admin,agent}'));
create policy knowledge_delete on storage.objects for delete using (
  bucket_id = 'knowledge' and has_org_role(((storage.foldername(name))[1])::uuid, '{owner,admin}'));

-- ── Retention: purge expired conversations (schedule with pg_cron) ───────
create or replace function purge_expired_conversations() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from conversations c using organizations o
  where c.organization_id = o.id and c.started_at < now() - make_interval(days => o.retention_days);
  get diagnostics n = row_count;
  return n;
end $$;
-- select cron.schedule('purge-conversations', '15 3 * * *', 'select purge_expired_conversations()');

-- ════ 0003_seed_plans.sql ════
-- Proposed launch prices (not confirmed market prices). Annual = 10 × monthly (2 months free).
insert into subscription_plans
  (code, name_en, name_ar, currency, price_monthly, price_annual, max_employees, monthly_voice_minutes, monthly_conversations, max_locations, sort_order, features)
values
  ('starter',  'Starter',  'المبتدئ',   'KWD', 19.000, 190.000,  1,  300,  1000, 1, 1,
    '["1 AI employee","Basic AI conversations","Basic analytics","Knowledge base","300 voice minutes / month","Email support"]'),
  ('business', 'Business', 'الأعمال',   'KWD', 49.000, 490.000,  3, 1200,  5000, 1, 2,
    '["Up to 3 AI employees","Advanced AI conversations","Arabic dialect selection","Call summaries","Appointment booking","WhatsApp integration (when connected)","Advanced analytics","Priority support"]'),
  ('pro',      'Pro',      'الاحترافي', 'KWD', 99.000, 990.000, 10, 4000, 20000, 5, 3,
    '["Up to 10 AI employees","Advanced automation","Multiple business locations","Advanced reporting","Custom AI instructions","Team management","Priority assistance","Higher monthly usage allowance"]')
on conflict (code) do nothing;

insert into platform_settings (key, value) values
  ('trial',           '{"enabled": true, "days": 14, "requires_card": false}'),
  ('annual_discount', '{"months_free": 2}'),
  ('default_currency','"KWD"'),
  ('ai',              '{"chat_model": "gpt-4o-mini", "realtime_model": "gpt-4o-realtime-preview"}')
on conflict (key) do nothing;

-- To make yourself a platform admin after signing up:
--   update users set platform_role = 'admin' where email = 'you@company.com';

-- ════ 0004_vault_and_admin.sql ════
-- Store third-party refresh tokens in Supabase Vault (encrypted at rest).
-- Callable only by an owner/admin of the caller's organization.
create or replace function vault_store_secret(secret text, name text) returns uuid
language plpgsql security definer set search_path = public, vault as $$
declare org uuid; id uuid;
begin
  select organization_id into org from memberships where user_id = auth.uid() and role in ('owner','admin') limit 1;
  if org is null or name not like '%' || org::text then raise exception 'Not allowed'; end if;
  select vault.create_secret(secret, name) into id;
  return id;
end $$;
revoke all on function vault_store_secret(text, text) from public;
grant execute on function vault_store_secret(text, text) to authenticated;

-- Platform analytics view for the admin panel (service role / admins only).
create or replace view admin_org_overview with (security_invoker = true) as
select o.id, o.name, o.country, o.status, o.created_at,
       p.code as plan, s.status as subscription_status, s.interval,
       case when s.status = 'active' then case s.interval when 'annual' then p.price_annual / 12 else p.price_monthly end else 0 end as mrr,
       (select count(*) from memberships m where m.organization_id = o.id) as members
from organizations o
left join subscriptions s on s.organization_id = o.id and s.status in ('trialing','active','past_due')
left join subscription_plans p on p.id = s.plan_id;

-- ════ 0005_enum_values.sql ════
-- New enum values must be committed before they can be used (Postgres rule),
-- so they live in their own migration ahead of 0006.
alter type plan_code add value if not exists 'enterprise';
