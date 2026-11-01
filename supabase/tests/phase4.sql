-- Phase 4: account deletion plan + user deletion no longer blocked by "created_by" references.
\set ON_ERROR_STOP on
\set QUIET on
grant usage on schema public, auth to authenticated;
grant all on all tables in schema public to authenticated;
grant execute on all functions in schema public, auth to authenticated;
create or replace function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin if not ok then raise exception 'FAILED: %', label; end if; raise notice 'ok - %', label; end $$;
create or replace function pg_temp.as_user(uid text) returns void language sql as $$ select set_config('request.jwt.claim.sub', uid, false) $$;

insert into auth.users (id, email, raw_user_meta_data) values
 ('41000000-0000-4000-8000-000000000001','solo@test.kw','{"full_name":"Solo"}'),
 ('41000000-0000-4000-8000-000000000002','boss@test.kw','{"full_name":"Boss"}'),
 ('41000000-0000-4000-8000-000000000003','staff@test.kw','{"full_name":"Staff"}');
create temp table o (solo uuid, team uuid);
grant all on o to authenticated;
set role authenticated;
select pg_temp.as_user('41000000-0000-4000-8000-000000000001');
insert into o (solo) select create_organization('Solo Shop', 'KW', 'restaurant');
select pg_temp.as_user('41000000-0000-4000-8000-000000000002');
update o set team = create_organization('Team Shop', 'KW', 'restaurant');
reset role;
insert into memberships (organization_id, user_id, role) select team, '41000000-0000-4000-8000-000000000003', 'employee' from o;

set role authenticated;
select pg_temp.as_user('41000000-0000-4000-8000-000000000001');
select pg_temp.check((select jsonb_array_length(account_deletion_plan()->'delete')) = 1, 'A1. sole member: their business would be deleted with them');
select pg_temp.as_user('41000000-0000-4000-8000-000000000002');
select pg_temp.check((select account_deletion_plan()->'block'->0->>'reason') = 'sole_owner', 'A2. only owner of a team: blocked until ownership is transferred');
select pg_temp.as_user('41000000-0000-4000-8000-000000000003');
select pg_temp.check((select jsonb_array_length(account_deletion_plan()->'leave')) = 1, 'A3. staff member: just leaves the business');
-- staff created a knowledge document; deleting the staff user must not be blocked by it
insert into knowledge_documents (organization_id, title, source_type, content_text, status, created_by)
  select team, 'Staff FAQ', 'faq', 'Q: hours? A: 9-5', 'ready', '41000000-0000-4000-8000-000000000003' from o;
reset role;
delete from auth.users where id = '41000000-0000-4000-8000-000000000003';
select pg_temp.check((select created_by is null from knowledge_documents where title = 'Staff FAQ'), 'A4. deleting a user keeps their records (creator becomes empty)');
select pg_temp.check(not exists (select 1 from memberships where user_id = '41000000-0000-4000-8000-000000000003'), 'A5. their memberships are removed');
\echo 'ALL PHASE 4 DATABASE TESTS PASSED'
