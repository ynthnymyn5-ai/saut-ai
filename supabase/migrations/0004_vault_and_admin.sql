-- Store third-party refresh tokens in Supabase Vault (encrypted at rest).
-- Callable only by an owner/admin of the caller's organization.
create or replace function vault_store_secret(secret text, name text) returns uuid
language plpgsql security definer set search_path = public, vault as $$
declare org uuid; id uuid;
begin
  select organization_id into org from memberships where user_id = auth.uid() and role in ('owner','admin') limit 1;
  if org is null or name not like '%' || org::text then raise exception 'Not allowed'; end if;
  select vault.create_secret(secret, name) into id;
  return id;
end $$;
revoke all on function vault_store_secret(text, text) from public;
grant execute on function vault_store_secret(text, text) to authenticated;

-- Platform analytics view for the admin panel (service role / admins only).
create or replace view admin_org_overview with (security_invoker = true) as
select o.id, o.name, o.country, o.status, o.created_at,
       p.code as plan, s.status as subscription_status, s.interval,
       case when s.status = 'active' then case s.interval when 'annual' then p.price_annual / 12 else p.price_monthly end else 0 end as mrr,
       (select count(*) from memberships m where m.organization_id = o.id) as members
from organizations o
left join subscriptions s on s.organization_id = o.id and s.status in ('trialing','active','past_due')
left join subscription_plans p on p.id = s.plan_id;
