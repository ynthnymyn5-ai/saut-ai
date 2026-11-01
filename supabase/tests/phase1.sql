-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 1 database tests: sign-up, onboarding RPC, roles, RLS isolation.
-- Run against a database with all migrations applied (scripts/test-db.sh does
-- this on a throwaway Postgres with a Supabase-compatible auth/storage stub).
-- Every check raises on failure; the script stops at the first failure.
-- ═══════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on
\set QUIET on
grant usage on schema public, auth to authenticated;
grant all on all tables in schema public to authenticated;
grant all on all sequences in schema public to authenticated;
grant execute on all functions in schema public, auth to authenticated;

create or replace function pg_temp.expect_fail(sql text, needle text default '') returns void language plpgsql as $$
begin
  begin execute sql; exception when others then
    if needle <> '' and position(needle in sqlerrm) = 0 then raise exception 'expected error containing "%", got: %', needle, sqlerrm; end if;
    return;
  end;
  raise exception 'expected failure but statement succeeded: %', sql;
end $$;
create or replace function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin if not ok then raise exception 'FAILED: %', label; end if; raise notice 'ok - %', label; end $$;

-- users: A (owner), B (other business), M (manager), E (employee), V (viewer), D (admin)
insert into auth.users (id, email, raw_user_meta_data) values
 ('a0000000-0000-4000-8000-000000000001','owner.a@test.kw','{"full_name":"Owner A"}'),
 ('b0000000-0000-4000-8000-000000000002','owner.b@test.kw','{"full_name":"Owner B"}'),
 ('c0000000-0000-4000-8000-000000000003','manager@test.kw','{"full_name":"Manager M"}'),
 ('d0000000-0000-4000-8000-000000000004','employee@test.kw','{"full_name":"Employee E"}'),
 ('e0000000-0000-4000-8000-000000000005','viewer@test.kw','{"full_name":"Viewer V"}'),
 ('f0000000-0000-4000-8000-000000000006','admin@test.kw','{"full_name":"Admin D"}');

select pg_temp.check((select count(*) from users) = 6, '1. sign-up trigger creates a profile per auth user');
select pg_temp.check((select full_name from profiles where email = 'owner.a@test.kw') = 'Owner A', '1. profiles view exposes the profile');

-- ── Owner A onboards ─────────────────────────────────────────────────────
set role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', false);
select pg_temp.expect_fail($$select create_organization('A')$$, '2–120');
select pg_temp.expect_fail($$select create_organization('Layali Cafe', 'KW', 'restaurant', null, null, 'Mars/Olympus')$$, 'timezone');
select pg_temp.expect_fail($$select create_organization('Layali Cafe', 'KW', 'restaurant', 'not-an-email')$$, 'contact_email');
create temp table ids as select create_organization('Layali Café', 'KW', 'restaurant', 'hello@layali.kw', '+965 5000 0000', 'Asia/Kuwait', 'ar', 'Salmiya') as org_a;
grant select on ids to authenticated;
select pg_temp.check((select count(*) from organizations) = 1, '2. owner sees exactly the new organization');
select pg_temp.check((select role from memberships where user_id = auth.uid()) = 'owner', '2. creator becomes owner');
select pg_temp.check((select status from subscriptions where organization_id = (select org_a from ids)) = 'trialing', '2. free trial subscription created (no payment)');
select pg_temp.check((select currency from organizations) = 'KWD' and (select industry from organizations) = 'restaurant', '2. org profile stored (currency, industry)');
select pg_temp.check(exists (select 1 from audit_logs where action = 'organization.created'), '2. audit log written');

-- owner adds members
insert into memberships (organization_id, user_id, role) select org_a, 'c0000000-0000-4000-8000-000000000003', 'manager' from ids;
insert into memberships (organization_id, user_id, role) select org_a, 'd0000000-0000-4000-8000-000000000004', 'employee' from ids;
insert into memberships (organization_id, user_id, role) select org_a, 'e0000000-0000-4000-8000-000000000005', 'viewer' from ids;
insert into memberships (organization_id, user_id, role) select org_a, 'f0000000-0000-4000-8000-000000000006', 'admin' from ids;
select pg_temp.check((select count(*) from memberships) = 5, '3. owner can add members');
select pg_temp.expect_fail($$update memberships set role = 'admin' where user_id = 'a0000000-0000-4000-8000-000000000001'$$, 'LAST_OWNER');
select pg_temp.check(true, '3. sole owner cannot demote themself');
select pg_temp.expect_fail($$update users set platform_role = 'admin' where id = auth.uid()$$, 'Not allowed');
select pg_temp.check(true, '3. users cannot grant themselves platform admin');
reset role;

-- ── Owner B onboards a different business ────────────────────────────────
set role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000002', false);
insert into ids select create_organization('Riyadh Homes', 'SA', 'real_estate', null, null, 'Asia/Riyadh', 'en');
insert into customers (organization_id, phone, full_name) select id, '+966500000001', 'B customer' from organizations;
select pg_temp.check((select count(*) from organizations) = 1, '4. owner B sees only their own organization');
select pg_temp.check((select currency from organizations) = 'SAR', '4. B org currency SAR');
reset role;

-- ── Isolation ────────────────────────────────────────────────────────────
set role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', false);
select pg_temp.check((select count(*) from customers) = 0, '5. owner A cannot read B''s customers');
select pg_temp.check((select count(*) from profiles where email = 'owner.b@test.kw') = 0, '5. owner A cannot read B''s profile');
select pg_temp.check((select count(*) from profiles where email = 'manager@test.kw') = 1, '5. owner A can read own team member''s profile');
select pg_temp.expect_fail($$insert into customers (organization_id, phone) values ((select org_a from ids offset 1 limit 1), '+96550000099')$$, 'row-level security');
select pg_temp.check(true, '5. owner A cannot write into B''s organization');
select pg_temp.check((select count(*) from subscriptions) = 1, '5. owner A sees only their own subscription');
reset role;

-- ── Employee E ───────────────────────────────────────────────────────────
set role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000004', false);
insert into customers (organization_id, phone, full_name) select org_a, '+96550000001', 'Abdullah' from ids limit 1;
insert into appointments (organization_id, customer_id, starts_at, kind) select c.organization_id, c.id, now() + interval '1 day', 'reservation' from customers c;
select pg_temp.check((select count(*) from appointments) = 1, '6. employee can create customers and appointments');
select pg_temp.expect_fail($$insert into ai_employees (organization_id, name) select org_a, 'Rogue' from ids limit 1$$, 'row-level security');
select pg_temp.check(true, '6. employee cannot create AI employees');
update organizations set name = 'Hacked' where true;
select pg_temp.check((select name from organizations) = 'Layali Café', '6. employee cannot edit the organization profile');
select pg_temp.expect_fail($$insert into memberships (organization_id, user_id, role) select org_a, 'b0000000-0000-4000-8000-000000000002', 'admin' from ids limit 1$$, 'row-level security');
select pg_temp.check(true, '6. employee cannot add members');
reset role;

-- ── Manager M ────────────────────────────────────────────────────────────
set role authenticated;
select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-000000000003', false);
insert into ai_employees (id, organization_id, name, dialect) select '11111111-0000-4000-8000-000000000001', org_a, 'Noura', 'kuwaiti' from ids limit 1;
insert into ai_employee_instructions (employee_id, version, content) values ('11111111-0000-4000-8000-000000000001', 1, 'Greet warmly.');
update ai_employees set name = 'Noura 2', status = 'active' where id = '11111111-0000-4000-8000-000000000001';
select pg_temp.check((select name from ai_employees) = 'Noura 2', '7. manager can create and edit AI employees + instructions');
select pg_temp.expect_fail($$insert into ai_employees (organization_id, name) select org_a, 'Second' from ids limit 1$$, 'PLAN_LIMIT');
select pg_temp.check(true, '7. plan limit enforced (starter trial = 1 AI employee)');
update memberships set role = 'admin' where user_id = 'd0000000-0000-4000-8000-000000000004';
select pg_temp.check((select role from memberships where user_id = 'd0000000-0000-4000-8000-000000000004') = 'employee', '7. manager cannot change member roles');
reset role;

-- ── Viewer V ─────────────────────────────────────────────────────────────
set role authenticated;
select set_config('request.jwt.claim.sub', 'e0000000-0000-4000-8000-000000000005', false);
select pg_temp.check((select count(*) from customers) = 1 and (select count(*) from ai_employees) = 1, '8. viewer can read organization data');
select pg_temp.expect_fail($$insert into customers (organization_id, phone) select org_a, '+96550000002' from ids limit 1$$, 'row-level security');
update customers set full_name = 'x' where true;
select pg_temp.check((select full_name from customers) = 'Abdullah', '8. viewer cannot write');
reset role;

-- ── Admin D ──────────────────────────────────────────────────────────────
set role authenticated;
select set_config('request.jwt.claim.sub', 'f0000000-0000-4000-8000-000000000006', false);
update organizations set contact_phone = '+965 6000 0000' where true;
select pg_temp.check((select contact_phone from organizations) = '+965 6000 0000', '9. admin can edit the organization profile');
select pg_temp.expect_fail($$update memberships set role = 'owner' where user_id = 'c0000000-0000-4000-8000-000000000003'$$, 'Only an owner');
select pg_temp.check(true, '9. admin cannot grant the owner role');
update memberships set role = 'manager' where user_id = 'd0000000-0000-4000-8000-000000000004';
select pg_temp.check((select role from memberships where user_id = 'd0000000-0000-4000-8000-000000000004') = 'manager', '9. admin can change member roles');
reset role;

-- ── Viewer leaves the organization themselves ────────────────────────────
set role authenticated;
select set_config('request.jwt.claim.sub', 'e0000000-0000-4000-8000-000000000005', false);
delete from memberships where user_id = auth.uid();
select pg_temp.check((select count(*) from organizations) = 0, '11. a member can leave and then loses access');
reset role;

-- ── Owner A deletes an AI employee; delete of org data stays scoped ──────
set role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', false);
update memberships set role = 'owner' where user_id = 'f0000000-0000-4000-8000-000000000006';
update memberships set role = 'admin' where user_id = 'a0000000-0000-4000-8000-000000000001';
select pg_temp.check((select count(*) from memberships where role = 'owner') = 1, '10. ownership can be handed over (owner → admin after granting another owner)');
reset role;
\echo 'ALL PHASE 1 DATABASE TESTS PASSED'
