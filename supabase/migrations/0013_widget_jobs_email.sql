-- ════════════════════════════════════════════════════════════════════════════
-- 0013 — Website chat widget sessions, outbound delivery queue (retries + failed list),
-- and per-member email notification preference. Additive and re-runnable.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Website widget: one conversation per anonymous browser session ─────────
alter table conversations add column if not exists web_session_id text check (web_session_id is null or web_session_id ~ '^[A-Za-z0-9_-]{16,64}$');
create unique index if not exists conversations_web_session_idx on conversations(organization_id, web_session_id) where web_session_id is not null;

-- ── Outbound delivery queue ───────────────────────────────────────────────
-- Every outbound send that failed for a temporary reason is retried with backoff; after
-- max_attempts it becomes "dead" and is listed for owners (who can retry or dismiss it).
create table if not exists outbound_jobs (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  kind             text not null check (kind in ('whatsapp_text', 'email')),
  payload          jsonb not null default '{}',
  status           text not null default 'pending' check (status in ('pending', 'sent', 'dead', 'dismissed')),
  attempts         int not null default 0 check (attempts between 0 and 20),
  max_attempts     int not null default 5 check (max_attempts between 1 and 20),
  next_attempt_at  timestamptz not null default now(),
  last_error       text check (char_length(last_error) <= 1000),
  conversation_id  uuid references conversations(id) on delete set null,
  message_id       uuid references messages(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  sent_at          timestamptz
);
create index if not exists outbound_jobs_due_idx on outbound_jobs(next_attempt_at) where status = 'pending';
create index if not exists outbound_jobs_org_idx on outbound_jobs(organization_id, created_at desc);
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_outbound_jobs_updated') then
    create trigger trg_outbound_jobs_updated before update on outbound_jobs for each row execute function set_updated_at();
  end if;
end $$;
alter table outbound_jobs enable row level security;
-- Owners/admins/managers can see the queue and retry/dismiss dead jobs; the server (service role) does the sending.
drop policy if exists outbound_jobs_read on outbound_jobs;
create policy outbound_jobs_read on outbound_jobs for select using (can_manage_ai(organization_id) or is_platform_admin());
drop policy if exists outbound_jobs_update on outbound_jobs;
create policy outbound_jobs_update on outbound_jobs for update using (can_manage_ai(organization_id)) with check (can_manage_ai(organization_id) and status in ('pending', 'dismissed'));

-- ── Email notifications per member ───────────────────────────────────────
alter table memberships add column if not exists notify_email boolean not null default true;
