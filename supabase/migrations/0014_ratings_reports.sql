-- ════════════════════════════════════════════════════════════════════════════
-- 0014 — Customer satisfaction ratings on conversations + weekly report log.
-- Additive and re-runnable; changes no existing rows.
-- ════════════════════════════════════════════════════════════════════════════
alter table conversations add column if not exists rating smallint check (rating is null or rating in (-1, 1));
alter table conversations add column if not exists rating_comment text check (rating_comment is null or char_length(rating_comment) <= 500);
alter table conversations add column if not exists rated_at timestamptz;
create index if not exists conversations_rated_idx on conversations(organization_id, rated_at desc) where rating is not null;

-- One weekly report per business per week (prevents duplicates if the job runs twice).
create table if not exists weekly_reports (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  week_start      date not null,
  data            jsonb not null default '{}',
  emailed_to      int not null default 0,
  created_at      timestamptz not null default now(),
  unique (organization_id, week_start)
);
alter table weekly_reports enable row level security;
drop policy if exists weekly_reports_read on weekly_reports;
create policy weekly_reports_read on weekly_reports for select using (can_manage_ai(organization_id) or is_platform_admin());
-- written only by the server (service role)

-- Allow the "report" notification kind (weekly report ready). Same list as before + 'report'.
alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in ('escalation','confirmation','usage','task','workflow_failed','integration','billing','lead','report'));
