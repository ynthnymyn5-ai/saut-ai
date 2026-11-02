-- Phase 6: security hardening (0016).
\set ON_ERROR_STOP on
\set QUIET on
grant usage on schema public, auth to authenticated;
grant all on all tables in schema public to authenticated;
create or replace function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin if not ok then raise exception 'FAILED: %', label; end if; raise notice 'ok - %', label; end $$;
create or replace function pg_temp.expect_fail(sql text, needle text default '') returns void language plpgsql as $$
begin
  begin execute sql; exception when others then
    if needle <> '' and position(needle in sqlerrm) = 0 then raise exception 'expected error containing "%", got: %', needle, sqlerrm; end if;
    return;
  end;
  raise exception 'expected failure but statement succeeded: %', sql;
end $$;
create or replace function pg_temp.as_user(uid text) returns void language sql as $$ select set_config('request.jwt.claim.sub', uid, false) $$;

insert into auth.users (id, email, raw_user_meta_data) values
 ('61000000-0000-4000-8000-000000000001','sec.a@test.kw','{"full_name":"Sec A"}'),
 ('61000000-0000-4000-8000-000000000002','sec.b@test.kw','{"full_name":"Sec B"}');
create temp table s (a uuid, b uuid, emp uuid);
grant all on s to authenticated;
set role authenticated;
select pg_temp.as_user('61000000-0000-4000-8000-000000000001');
insert into s (a) select create_organization('Sec Shop A', 'KW', 'restaurant');
select pg_temp.check((select a from s) is not null, 'S0. onboarding (create_organization) still works');
select pg_temp.as_user('61000000-0000-4000-8000-000000000002');
update s set b = create_organization('Sec Shop B', 'KW', 'restaurant');
reset role;

-- A suspended business cannot re-activate itself
update organizations set status = 'suspended' where id = (select a from s);
set role authenticated;
select pg_temp.as_user('61000000-0000-4000-8000-000000000001');
select pg_temp.expect_fail($$update organizations set status = 'active' where id = (select a from s)$$, 'Not allowed');
select pg_temp.check(true, 'S1. owner cannot change the business status');
update organizations set name = 'Sec Shop A2' where id = (select a from s);
select pg_temp.check((select name from organizations where id = (select a from s)) = 'Sec Shop A2', 'S2. owner can still edit normal business fields');
select pg_temp.expect_fail($$insert into organizations (name, slug) values ('Sneaky', 'sneaky-1')$$);
select pg_temp.check(true, 'S3. businesses cannot be inserted directly (only via onboarding)');
reset role;
update organizations set status = 'active' where id = (select a from s);

-- Integrations are server-only: B cannot claim A's widget key / WhatsApp number
insert into integrations (organization_id, provider, status, config) select a, 'web_widget', 'connected', '{"key":"wk_victim_key_123456","domain":"a.example"}' from s;
insert into integrations (organization_id, provider, status, config) select a, 'whatsapp', 'connected', '{"phone_number_id":"111"}' from s;
set role authenticated;
select pg_temp.as_user('61000000-0000-4000-8000-000000000002');
select pg_temp.expect_fail($$insert into integrations (organization_id, provider, status, config) select b, 'whatsapp', 'connected', '{"phone_number_id":"111"}' from s$$);
select pg_temp.check(true, 'S4. owner cannot write integrations directly');
select pg_temp.as_user('61000000-0000-4000-8000-000000000001');
update integrations set status = 'connected', config = '{"phone_number_id":"999"}' where organization_id = (select a from s) and provider = 'whatsapp';
reset role;
select pg_temp.check((select config->>'phone_number_id' from integrations where organization_id = (select a from s) and provider = 'whatsapp') = '111', 'S5. direct integration updates have no effect');
select pg_temp.expect_fail($$insert into integrations (organization_id, provider, status, config) select b, 'web_widget', 'pending', '{"key":"wk_victim_key_123456"}' from s$$, 'integrations_widget_key_uniq');
select pg_temp.expect_fail($$insert into integrations (organization_id, provider, status, config) select b, 'whatsapp', 'connected', '{"phone_number_id":"111"}' from s$$, 'integrations_whatsapp_number_uniq');
select pg_temp.check(true, 'S6. a widget key / WhatsApp number belongs to one business only');

-- AI employee phone numbers are set by the server only, and are unique
insert into ai_employees (organization_id, name, phone_number) select a, 'Sara', '+96522000000' from s;
update s set emp = (select id from ai_employees where organization_id = s.a and name = 'Sara');
select pg_temp.expect_fail($$insert into ai_employees (organization_id, name, phone_number) select b, 'Thief', '+96522000000' from s$$, 'duplicate key');
set role authenticated;
select pg_temp.as_user('61000000-0000-4000-8000-000000000001');
select pg_temp.expect_fail($$update ai_employees set phone_number = '+96522000001' where id = (select emp from s)$$, 'Integrations');
update ai_employees set name = 'Sara 2' where id = (select emp from s);
select pg_temp.check((select name from ai_employees where id = (select emp from s)) = 'Sara 2', 'S7. phone numbers are server-only and unique; other employee edits still work');
reset role;
select pg_temp.check(true, 'ALL PHASE 6 DATABASE TESTS PASSED');
