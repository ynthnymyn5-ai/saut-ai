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
