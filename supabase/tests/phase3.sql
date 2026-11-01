-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 3 database tests: orders (server-side pricing, isolation, history),
-- inbox read state, customer erasure. Runs after phase1/phase2 (scripts/test-db.sh).
-- ═══════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on
\set QUIET on
grant usage on schema public, auth to authenticated;
grant all on all tables in schema public to authenticated;
grant all on all sequences in schema public to authenticated;
grant execute on all functions in schema public, auth to authenticated;

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
 ('31000000-0000-4000-8000-000000000001','cafe.owner@test.kw','{"full_name":"Cafe Owner"}'),
 ('31000000-0000-4000-8000-000000000002','cafe.staff@test.kw','{"full_name":"Cafe Staff"}'),
 ('31000000-0000-4000-8000-000000000003','cafe.viewer@test.kw','{"full_name":"Cafe Viewer"}'),
 ('31000000-0000-4000-8000-000000000004','rival.owner@test.kw','{"full_name":"Rival Owner"}');

create temp table ids (cafe uuid);
create temp table rival (id uuid);
grant all on ids, rival to authenticated;
set role authenticated;
select pg_temp.as_user('31000000-0000-4000-8000-000000000001');
insert into ids select create_organization('Location Cafe', 'KW', 'restaurant');
select pg_temp.as_user('31000000-0000-4000-8000-000000000004');
insert into rival select create_organization('Rival Cafe', 'KW', 'restaurant');
reset role;
insert into memberships (organization_id, user_id, role) select cafe, '31000000-0000-4000-8000-000000000002', 'employee' from ids;
insert into memberships (organization_id, user_id, role) select cafe, '31000000-0000-4000-8000-000000000003', 'viewer' from ids;

-- ── Products ─────────────────────────────────────────────────────────────
set role authenticated;
select pg_temp.as_user('31000000-0000-4000-8000-000000000001');
insert into products (organization_id, name, price) select cafe, 'Latte', 1.500 from ids;
insert into products (organization_id, name, price) select cafe, 'Cookie', 0.750 from ids;
insert into products (organization_id, name, price, is_active) select cafe, 'Old item', 9.000, false from ids;
select pg_temp.check((select count(*) from products) = 3, 'O1. owner manages the product catalogue');
select pg_temp.as_user('31000000-0000-4000-8000-000000000002');
select pg_temp.expect_fail($$insert into products (organization_id, name, price) select cafe, 'Hack', 0 from ids$$);
select pg_temp.check(true, 'O2. staff cannot change prices or products');
reset role;
create temp table p as select id, name from products;
insert into products (organization_id, name, price) select id, 'Rival latte', 0.100 from rival;
create temp table rp as select id from products where name = 'Rival latte';
grant select on p, rp to authenticated;

-- ── Orders: server-side totals ───────────────────────────────────────────
set role authenticated;
select pg_temp.as_user('31000000-0000-4000-8000-000000000002');
create temp table o1 as select create_order((select cafe from ids),
  jsonb_build_array(jsonb_build_object('product_id', (select id from p where name = 'Latte'), 'quantity', 2),
                    jsonb_build_object('product_id', (select id from p where name = 'Cookie'), 'quantity', 1))) as id;
select pg_temp.check((select total from orders where id = (select id from o1)) = 3.750, 'O3. total is computed from catalogue prices (2×1.500 + 0.750 = 3.750)');
select pg_temp.check((select count(*) from order_items where order_id = (select id from o1)) = 2, 'O4. items stored with price snapshot');
select pg_temp.check((select order_no from orders where id = (select id from o1)) = 1001, 'O5. order numbers start at 1001 per business');
create temp table o2 as select create_order((select cafe from ids), jsonb_build_array(jsonb_build_object('product_id', (select id from p where name = 'Cookie'), 'quantity', 4))) as id;
select pg_temp.check((select order_no from orders where id = (select id from o2)) = 1002, 'O6. order numbers are sequential');
select pg_temp.expect_fail($$select create_order((select cafe from ids), jsonb_build_array(jsonb_build_object('product_id', (select id from p where name = 'Old item'), 'quantity', 1)))$$, 'Product not available');
select pg_temp.check(true, 'O7. inactive products cannot be ordered');
select pg_temp.expect_fail($$select create_order((select cafe from ids), jsonb_build_array(jsonb_build_object('product_id', (select id from rp), 'quantity', 1)))$$);
select pg_temp.check(true, 'O8. another business''s product cannot be used');
select pg_temp.expect_fail($$select create_order((select cafe from ids), jsonb_build_array(jsonb_build_object('product_id', (select id from p where name = 'Latte'), 'quantity', 0)))$$, 'Invalid quantity');
select pg_temp.expect_fail($$select create_order((select cafe from ids), '[]'::jsonb)$$, 'at least one item');
select pg_temp.check(true, 'O9. invalid quantities and empty orders are rejected');
select pg_temp.expect_fail($$update orders set total = 0.001 where id = (select id from o1)$$, 'computed from items');
select pg_temp.check(true, 'O10. totals cannot be edited directly');
update orders set status = 'confirmed' where id = (select id from o1);
select pg_temp.check((select count(*) from order_events where order_id = (select id from o1)) = 2, 'O11. status history is recorded (created + confirmed)');

select pg_temp.as_user('31000000-0000-4000-8000-000000000003');
select pg_temp.check((select count(*) from orders) = 2, 'O12. viewer can see orders');
select pg_temp.expect_fail($$select create_order((select cafe from ids), jsonb_build_array(jsonb_build_object('product_id', (select id from p where name = 'Latte'), 'quantity', 1)))$$);
select pg_temp.check(true, 'O13. viewer cannot create orders');

select pg_temp.as_user('31000000-0000-4000-8000-000000000004');
select pg_temp.check((select count(*) from orders) = 0 and (select count(*) from order_items) = 0, 'O14. another business sees none of these orders');
select pg_temp.expect_fail($$select create_order((select cafe from ids), jsonb_build_array(jsonb_build_object('product_id', (select id from p where name = 'Latte'), 'quantity', 1)))$$);
select pg_temp.check(true, 'O15. another business cannot create orders here');
update orders set status = 'canceled' where true;
select pg_temp.check(true, 'O16. (update by outsider affects nothing)');
reset role;
select pg_temp.check((select status from orders where id = (select id from o1)) = 'confirmed', 'O16. outsider update changed nothing');

-- ── Inbox read state ─────────────────────────────────────────────────────
insert into customers (id, organization_id, phone, full_name) select '32000000-0000-4000-8000-000000000001', cafe, '+96550001111', 'Fatima' from ids;
insert into conversations (id, organization_id, customer_id, channel, summary) select '33000000-0000-4000-8000-000000000001', cafe, '32000000-0000-4000-8000-000000000001', 'whatsapp', 'Asked about latte' from ids;
insert into messages (conversation_id, organization_id, role, content) select '33000000-0000-4000-8000-000000000001', cafe, 'customer', 'Do you have oat milk?' from ids;
update orders set customer_id = '32000000-0000-4000-8000-000000000001' where id = (select id from o1);
set role authenticated;
select pg_temp.as_user('31000000-0000-4000-8000-000000000002');
update conversations set staff_read_at = now(), assigned_user = '31000000-0000-4000-8000-000000000002' where id = '33000000-0000-4000-8000-000000000001';
select pg_temp.check((select staff_read_at is not null and assigned_user is not null from conversations where id = '33000000-0000-4000-8000-000000000001'), 'I1. staff can mark read and assign conversations');

-- ── Customer erasure ─────────────────────────────────────────────────────
select pg_temp.expect_fail($$select erase_customer((select cafe from ids), '32000000-0000-4000-8000-000000000001')$$, 'Only owners and admins');
select pg_temp.check(true, 'E1. staff cannot erase customer data');
select pg_temp.as_user('31000000-0000-4000-8000-000000000004');
select pg_temp.expect_fail($$select erase_customer((select cafe from ids), '32000000-0000-4000-8000-000000000001')$$, 'Only owners and admins');
select pg_temp.check(true, 'E2. another business cannot erase this customer');
select pg_temp.as_user('31000000-0000-4000-8000-000000000001');
create temp table er as select erase_customer((select cafe from ids), '32000000-0000-4000-8000-000000000001') as r;
reset role;
select pg_temp.check((select (r->>'messages')::int from er) = 1, 'E3. erasure reports what it removed');
select pg_temp.check(not exists (select 1 from customers where id = '32000000-0000-4000-8000-000000000001'), 'E4. customer record is deleted');
select pg_temp.check(not exists (select 1 from messages where conversation_id = '33000000-0000-4000-8000-000000000001'), 'E5. their messages are deleted');
select pg_temp.check((select customer_id is null and summary is null from conversations where id = '33000000-0000-4000-8000-000000000001'), 'E6. conversation kept for records but anonymised');
select pg_temp.check((select customer_id is null from orders where id = (select id from o1)), 'E7. order kept for accounting, unlinked');
select pg_temp.check(exists (select 1 from audit_logs where action = 'customer.erased'), 'E8. erasure is audited');
\echo 'ALL PHASE 3 DATABASE TESTS PASSED'
