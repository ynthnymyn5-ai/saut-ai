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
