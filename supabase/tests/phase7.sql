-- Phase 7: order tracking links + saved replies (0017).
\set ON_ERROR_STOP on
\set QUIET on
grant usage on schema public, auth to authenticated, anon;
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
 ('71000000-0000-4000-8000-000000000001','track.owner@test.kw','{"full_name":"Track Owner"}'),
 ('71000000-0000-4000-8000-000000000002','track.other@test.kw','{"full_name":"Other Owner"}');
create temp table t (org uuid, other uuid, latte uuid, ord uuid, tok text);
grant all on t to authenticated, anon;
set role authenticated;
select pg_temp.as_user('71000000-0000-4000-8000-000000000001');
insert into t (org) select create_organization('Track Cafe', 'KW', 'restaurant');
insert into products (organization_id, name, price) select org, 'Latte', 1.500 from t;
update t set latte = (select id from products where name = 'Latte' and organization_id = t.org);
update t set ord = create_order((select org from t), jsonb_build_array(jsonb_build_object('product_id', (select latte from t), 'quantity', 2)));
update t set tok = (select tracking_token from orders where id = t.ord);
select pg_temp.check((select tok ~ '^[0-9a-f]{64}$' from t), 'T1. every order gets an unguessable 64-character tracking token');
select pg_temp.expect_fail($$update orders set tracking_token = repeat('a', 64) where id = (select ord from t)$$, 'Not allowed');
select pg_temp.check(true, 'T2. the tracking token cannot be changed from the browser');
reset role;

set role anon;
select pg_temp.check((select (get_order_tracking((select tok from t)))->>'status' = 'pending'), 'T3. anyone with the link sees the order status');
select pg_temp.check((select not (get_order_tracking((select tok from t)) ?| array['phone', 'customer', 'address', 'delivery_address', 'notes'])), 'T4. the tracking page shows no phone, name, address or notes');
select pg_temp.check((select jsonb_array_length(get_order_tracking((select tok from t))->'items') = 1), 'T5. items are listed');
select pg_temp.check((select get_order_tracking(repeat('0', 64)) is null and get_order_tracking('abc') is null), 'T6. wrong or malformed tokens reveal nothing');
reset role;

set role authenticated;
select pg_temp.as_user('71000000-0000-4000-8000-000000000001');
insert into saved_replies (organization_id, title, body) select org, 'الموقع', 'موقعنا في السالمية، شارع سالم المبارك' from t;
select pg_temp.check((select count(*) from saved_replies where organization_id = (select org from t)) = 1, 'R1. staff can save a reply');
select pg_temp.as_user('71000000-0000-4000-8000-000000000002');
update t set other = create_organization('Other Cafe', 'KW', 'restaurant');
select pg_temp.check((select count(*) from saved_replies) = 0, 'R2. another business cannot see the replies');
select pg_temp.expect_fail($$insert into saved_replies (organization_id, title, body) select org, 'x', 'y' from t$$);
select pg_temp.check(true, 'R3. another business cannot add replies to this one');
reset role;
select pg_temp.check(true, 'ALL PHASE 7 DATABASE TESTS PASSED');
