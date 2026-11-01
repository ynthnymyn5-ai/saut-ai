-- ════════════════════════════════════════════════════════════════════════════
-- 0012 — Account deletion support. Re-runnable; changes no data.
-- Several "created_by / updated_by / assigned_to / confirmed_by" columns referenced users(id)
-- with the default NO ACTION, which made it impossible to delete a person who had ever created
-- a record in a business that continues to exist. Those references now become NULL instead
-- (the record itself is kept, and the audit log keeps who did what).
-- ════════════════════════════════════════════════════════════════════════════
do $$
declare r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tbl, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'public.users'::regclass
      and c.confdeltype = 'a'                     -- NO ACTION
      and array_length(c.conkey, 1) = 1
      and c.connamespace = 'public'::regnamespace
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format('alter table %s add constraint %I foreign key (%I) references users(id) on delete set null', r.tbl, r.conname, r.col);
    raise notice 'users FK % on %.% now ON DELETE SET NULL', r.conname, r.tbl, r.col;
  end loop;
end $$;

/**
 * What deleting the CALLER's account would do, without doing it: businesses that would be
 * deleted (caller is the only member), businesses that block deletion (caller is the only
 * owner but others are members, or a paid subscription is still running).
 */
create or replace function account_deletion_plan() returns jsonb
language plpgsql security definer set search_path = public stable as $$
declare uid uuid := auth.uid(); out_delete jsonb := '[]'; out_block jsonb := '[]'; out_leave jsonb := '[]'; m record;
  members int; owners int; paid boolean;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  for m in select ms.organization_id, ms.role, o.name from memberships ms join organizations o on o.id = ms.organization_id where ms.user_id = uid loop
    select count(*), count(*) filter (where role = 'owner') into members, owners from memberships where organization_id = m.organization_id;
    select exists (select 1 from subscriptions s where s.organization_id = m.organization_id and s.status in ('active','past_due')
                   and s.provider is not null and not s.cancel_at_period_end) into paid;
    if members = 1 then
      if paid then out_block := out_block || jsonb_build_object('id', m.organization_id, 'name', m.name, 'reason', 'subscription_active');
      else out_delete := out_delete || jsonb_build_object('id', m.organization_id, 'name', m.name); end if;
    elsif m.role = 'owner' and owners = 1 then
      out_block := out_block || jsonb_build_object('id', m.organization_id, 'name', m.name, 'reason', 'sole_owner');
    else
      out_leave := out_leave || jsonb_build_object('id', m.organization_id, 'name', m.name);
    end if;
  end loop;
  return jsonb_build_object('delete', out_delete, 'block', out_block, 'leave', out_leave);
end $$;
revoke all on function account_deletion_plan() from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then grant execute on function account_deletion_plan() to authenticated; end if;
end $$;
