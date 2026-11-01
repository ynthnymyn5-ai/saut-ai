-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 2 database tests: billing lifecycle (migration 0009).
-- Runs after phase1.sql on the same throwaway database (scripts/test-db.sh).
-- ═══════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on
\set QUIET on
create or replace function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin if not ok then raise exception 'FAILED: %', label; end if; raise notice 'ok - %', label; end $$;

insert into organizations (id, name, slug) values
 ('10000000-0000-4000-8000-000000000001', 'Trial ended',        'p2-trial-ended'),
 ('10000000-0000-4000-8000-000000000002', 'Trial running',      'p2-trial-running'),
 ('10000000-0000-4000-8000-000000000003', 'MF lapsed',          'p2-mf-lapsed'),
 ('10000000-0000-4000-8000-000000000004', 'MF in grace',        'p2-mf-grace'),
 ('10000000-0000-4000-8000-000000000005', 'MF cancel at end',   'p2-mf-cancel'),
 ('10000000-0000-4000-8000-000000000006', 'MF past due final',  'p2-mf-final'),
 ('10000000-0000-4000-8000-000000000007', 'Stripe lapsed',      'p2-stripe');

insert into subscriptions (id, organization_id, plan_id, status, provider, trial_ends_at, current_period_start, current_period_end, cancel_at_period_end, provider_recurring_id)
select v.id::uuid, v.org::uuid, (select id from subscription_plans where code = 'starter'), v.status::subscription_status, v.provider::payment_provider,
       v.trial_end, now() - interval '40 days', v.period_end, v.cae, v.rec
from (values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','trialing', null,         now() - interval '1 hour', now() - interval '1 hour', false, null),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','trialing', null,         now() + interval '5 days', now() + interval '5 days', false, null),
 ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','active',   'myfatoorah', null,                      now() - interval '4 days', false, 'RECUR1'),
 ('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004','active',   'myfatoorah', null,                      now() - interval '1 day',  false, 'RECUR2'),
 ('20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005','active',   'myfatoorah', null,                      now() - interval '1 hour', true,  null),
 ('20000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000006','past_due', 'myfatoorah', null,                      now() - interval '11 days', false, null),
 ('20000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000007','active',   'stripe',     null,                      now() - interval '30 days', false, null)
) as v(id, org, status, provider, trial_end, period_end, cae, rec);

create temp table changed as select * from expire_lapsed_subscriptions();
select pg_temp.check((select count(*) from changed) = 4, 'B1. exactly the four lapsed subscriptions change');

create or replace function pg_temp.st(sub text) returns text language sql as $$ select status::text from subscriptions where id = sub::uuid $$;
select pg_temp.check(pg_temp.st('20000000-0000-4000-8000-000000000001') = 'canceled', 'B2. an ended free trial is closed');
select pg_temp.check(pg_temp.st('20000000-0000-4000-8000-000000000002') = 'trialing', 'B3. a running trial is untouched');
select pg_temp.check(pg_temp.st('20000000-0000-4000-8000-000000000003') = 'past_due', 'B4. a MyFatoorah renewal missing after the grace period becomes past due');
select pg_temp.check(pg_temp.st('20000000-0000-4000-8000-000000000004') = 'active',   'B5. within the grace period the plan stays active');
select pg_temp.check(pg_temp.st('20000000-0000-4000-8000-000000000005') = 'canceled', 'B6. cancel-at-period-end ends when the period ends');
select pg_temp.check(pg_temp.st('20000000-0000-4000-8000-000000000006') = 'canceled', 'B7. past due beyond the final window is cancelled');
select pg_temp.check(pg_temp.st('20000000-0000-4000-8000-000000000007') = 'active',   'B8. Stripe subscriptions are left to Stripe webhooks');
select pg_temp.check((select canceled_at is not null from subscriptions where id = '20000000-0000-4000-8000-000000000001'), 'B9. cancellation time is recorded');
select pg_temp.check((select count(*) from notifications where kind = 'billing' and organization_id::text like '10000000-%') = 4, 'B10. each affected owner gets one billing notification');
select pg_temp.check((select count(*) from audit_logs where action = 'subscription.lifecycle') = 4, 'B11. every change is audited');
select pg_temp.check((select count(*) from expire_lapsed_subscriptions()) = 0, 'B12. running it again changes nothing (idempotent)');
select pg_temp.check((select provider_recurring_id from subscriptions where id = '20000000-0000-4000-8000-000000000003') = 'RECUR1', 'B13. MyFatoorah recurring id is stored');
-- a cancelled org can start a fresh subscription (one live subscription per org still holds)
insert into subscriptions (organization_id, plan_id, status, provider) values ('10000000-0000-4000-8000-000000000001', (select id from subscription_plans where code = 'business'), 'incomplete', 'myfatoorah');
select pg_temp.check(true, 'B14. a new checkout can start after the trial ended');
select pg_temp.check(not has_function_privilege('anon', 'expire_lapsed_subscriptions(interval, interval)', 'execute'), 'B15. anonymous users cannot run the billing job');
-- ── Knowledge processing columns & index ──
insert into knowledge_documents (organization_id, title, source_type, mime_type, status, error)
values ('10000000-0000-4000-8000-000000000002', 'Scan', 'file', 'application/pdf', 'failed', 'No readable text found');
select pg_temp.check((select error from knowledge_documents where title = 'Scan') = 'No readable text found', 'K1. a failed document keeps its reason');
do $$ begin
  begin insert into knowledge_documents (organization_id, title, source_type, status, error) values ('10000000-0000-4000-8000-000000000002', 'X', 'text', 'failed', repeat('x', 501));
        raise exception 'should fail'; exception when check_violation then null; end;
end $$;
select pg_temp.check(true, 'K2. error text is bounded');
select pg_temp.check(exists (select 1 from pg_indexes where indexname = 'knowledge_documents_fts_idx'), 'K3. full-text index for knowledge search exists');
\echo 'ALL PHASE 2 DATABASE TESTS PASSED'
