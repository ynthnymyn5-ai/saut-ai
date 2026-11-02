-- Phase 5: delivery zones, fees, addresses, out-for-delivery.
\set ON_ERROR_STOP on
\set QUIET on
grant usage on schema public, auth to authenticated;
grant all on all tables in schema public to authenticated;
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
 ('51000000-0000-4000-8000-000000000001','deli.owner@test.kw','{"full_name":"Deli Owner"}'),
 ('51000000-0000-4000-8000-000000000002','deli.staff@test.kw','{"full_name":"Deli Staff"}');
create temp table d (org uuid, latte uuid, salmiya uuid);
grant all on d to authenticated;
set role authenticated;
select pg_temp.as_user('51000000-0000-4000-8000-000000000001');
insert into d (org) select create_organization('Deli Cafe', 'KW', 'restaurant');
insert into products (organization_id, name, price) select org, 'Latte', 1.500 from d;
update d set latte = (select id from products where name = 'Latte' and organization_id = d.org);
reset role;
insert into memberships (organization_id, user_id, role) select org, '51000000-0000-4000-8000-000000000002', 'employee' from d;
set role authenticated;

-- no zones yet: delivery allowed with a complete address, no fee
create temp table o1 as select create_order((select org from d), jsonb_build_array(jsonb_build_object('product_id', (select latte from d), 'quantity', 2)),
  p_fulfillment => 'delivery', p_address => '{"area":"Salmiya","block":"10","street":"Salem Al Mubarak","house":"5"}') as id;
select pg_temp.check((select total from orders where id = (select id from o1)) = 3.000, 'D1. no zones configured: delivery has no fee');
select pg_temp.expect_fail($$select create_order((select org from d), jsonb_build_array(jsonb_build_object('product_id', (select latte from d), 'quantity', 1)), p_fulfillment => 'delivery', p_address => '{"area":"Salmiya"}')$$, 'address incomplete');
select pg_temp.check(true, 'D2. delivery needs area, block and house/street');

-- zones
insert into delivery_zones (organization_id, name, areas, fee, min_order) select org, 'السالمية', '{Salmiya,سالمية}', 0.750, 2.000 from d;
create temp table o2 as select create_order((select org from d), jsonb_build_array(jsonb_build_object('product_id', (select latte from d), 'quantity', 2)),
  p_fulfillment => 'delivery', p_address => '{"area":"salmiya","block":"10","house":"5"}') as id;
select pg_temp.check((select (subtotal, delivery_fee, total) = (3.000, 0.750, 3.750) and delivery_zone_id is not null from orders where id = (select id from o2)), 'D3. area matched to a zone: fee added on the server (3.000 + 0.750)');
select pg_temp.expect_fail($$select create_order((select org from d), jsonb_build_array(jsonb_build_object('product_id', (select latte from d), 'quantity', 1)), p_fulfillment => 'delivery', p_address => '{"area":"Jahra","block":"1","house":"2"}')$$, 'Outside delivery area');
select pg_temp.check(true, 'D4. areas outside the zones are refused');
select pg_temp.expect_fail($$select create_order((select org from d), jsonb_build_array(jsonb_build_object('product_id', (select latte from d), 'quantity', 1)), p_fulfillment => 'delivery', p_address => '{"area":"Salmiya","block":"1","house":"2"}')$$, 'Below minimum order');
select pg_temp.check(true, 'D5. minimum order per zone is enforced');
create temp table o3 as select create_order((select org from d), jsonb_build_array(jsonb_build_object('product_id', (select latte from d), 'quantity', 1)), p_address => '{"area":"x"}') as id;
select pg_temp.check((select delivery_address is null and delivery_fee = 0 from orders where id = (select id from o3)), 'D6. pickup orders keep no address and no fee');
select pg_temp.expect_fail($$update orders set delivery_fee = 0 where id = (select id from o2)$$, 'computed from items');
select pg_temp.check(true, 'D7. delivery fee cannot be edited directly');

-- staff: cannot manage zones, can move status and assign driver
select pg_temp.as_user('51000000-0000-4000-8000-000000000002');
select pg_temp.expect_fail($$insert into delivery_zones (organization_id, name, fee) select org, 'Hack', 0 from d$$);
select pg_temp.check(true, 'D8. staff cannot change delivery zones or fees');
update orders set status = 'out_for_delivery', driver_user = '51000000-0000-4000-8000-000000000002', out_for_delivery_at = now() where id = (select id from o2);
select pg_temp.check((select status = 'out_for_delivery' and driver_user is not null from orders where id = (select id from o2)), 'D9. staff marks "out for delivery" and is the driver');
reset role;
select pg_temp.check((select count(*) from order_events where order_id = (select id from o2) and to_status = 'out_for_delivery') = 1, 'D10. the status change is in the order history');
\echo 'ALL PHASE 5 DATABASE TESTS PASSED'
