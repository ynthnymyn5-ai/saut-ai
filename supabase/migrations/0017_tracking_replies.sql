-- 0017: customer order tracking links + saved replies for staff. Non-destructive.

-- 1) Every order gets an unguessable tracking token (64 hex chars) for a public status page.
alter table orders add column if not exists tracking_token text;
update orders set tracking_token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '') where tracking_token is null;
alter table orders alter column tracking_token set default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
alter table orders alter column tracking_token set not null;
create unique index if not exists orders_tracking_token_key on orders (tracking_token);

-- Only what the customer needs to see: no phone, no address, no staff names.
create or replace function get_order_tracking(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o record; v jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return null; end if;
  select ord.id, ord.organization_id, ord.order_no, ord.status, ord.fulfillment, ord.subtotal, ord.delivery_fee, ord.total, ord.currency,
         ord.created_at, ord.out_for_delivery_at, org.name as business, org.preferred_language as lang, z.name as zone
    into o
    from orders ord join organizations org on org.id = ord.organization_id
    left join delivery_zones z on z.id = ord.delivery_zone_id
   where ord.tracking_token = p_token;
  if not found then return null; end if;
  v := jsonb_build_object(
    'business', o.business, 'lang', o.lang, 'order_no', o.order_no, 'status', o.status, 'fulfillment', o.fulfillment,
    'subtotal', o.subtotal, 'delivery_fee', o.delivery_fee, 'total', o.total, 'currency', o.currency, 'zone', o.zone,
    'created_at', o.created_at, 'out_for_delivery_at', o.out_for_delivery_at,
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', i.name, 'quantity', i.quantity) order by i.name)
                         from order_items i where i.order_id = o.id and i.organization_id = o.organization_id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('status', e.to_status, 'at', e.created_at) order by e.created_at)
                          from order_events e where e.order_id = o.id and e.organization_id = o.organization_id), '[]'::jsonb));
  return v;
end $$;
revoke all on function get_order_tracking(text) from public;
grant execute on function get_order_tracking(text) to anon, authenticated;

-- The tracking token can't be changed from the browser (it would break links customers already have).
create or replace function protect_tracking_token() returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and new.tracking_token is distinct from old.tracking_token then
    raise exception 'Not allowed to change this field' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists trg_protect_tracking_token on orders;
create trigger trg_protect_tracking_token before update on orders for each row execute function protect_tracking_token();

-- 2) Saved replies: short messages staff send from the inbox with one tap.
create table if not exists saved_replies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  body text not null check (char_length(body) between 1 and 2000),
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists saved_replies_org_idx on saved_replies (organization_id, title);
alter table saved_replies enable row level security;
drop policy if exists saved_replies_read on saved_replies;
create policy saved_replies_read on saved_replies for select using (is_member(organization_id) or is_platform_admin());
drop policy if exists saved_replies_write on saved_replies;
create policy saved_replies_write on saved_replies for all using (can_operate(organization_id)) with check (can_operate(organization_id));
