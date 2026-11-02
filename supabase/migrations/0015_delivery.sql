-- ════════════════════════════════════════════════════════════════════════════
-- 0015 — Delivery: zones with fees, Kuwait-style addresses on orders, driver assignment,
-- "out for delivery" status. Additive; existing orders keep working (fee 0, no address).
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists delivery_zones (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 80),   -- e.g. "السالمية" or "Hawalli governorate"
  areas           text[] not null default '{}' check (cardinality(areas) <= 100), -- extra area names this zone covers
  fee             numeric(12,3) not null default 0 check (fee >= 0 and fee <= 1000),
  min_order       numeric(12,3) not null default 0 check (min_order >= 0 and min_order <= 100000),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists delivery_zones_org_idx on delivery_zones(organization_id, is_active);
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_delivery_zones_updated') then
    create trigger trg_delivery_zones_updated before update on delivery_zones for each row execute function set_updated_at();
  end if;
end $$;
alter table delivery_zones enable row level security;
drop policy if exists delivery_zones_read on delivery_zones;
create policy delivery_zones_read on delivery_zones for select using (is_member(organization_id) or is_platform_admin());
drop policy if exists delivery_zones_write on delivery_zones;
create policy delivery_zones_write on delivery_zones for all using (can_manage_ai(organization_id)) with check (can_manage_ai(organization_id));

alter table orders add column if not exists delivery_address jsonb check (delivery_address is null or jsonb_typeof(delivery_address) = 'object');
alter table orders add column if not exists delivery_zone_id uuid references delivery_zones(id) on delete set null;
alter table orders add column if not exists delivery_fee numeric(12,3) not null default 0 check (delivery_fee >= 0);
alter table orders add column if not exists driver_user uuid references users(id) on delete set null;
alter table orders add column if not exists out_for_delivery_at timestamptz;

-- new status between ready and delivered
alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check check (status in ('pending','confirmed','preparing','ready','out_for_delivery','delivered','canceled'));

-- protect_order_totals also guards the delivery fee
create or replace function protect_order_totals() returns trigger language plpgsql as $$
begin
  if (new.subtotal, new.total, new.delivery_fee) is distinct from (old.subtotal, old.total, old.delivery_fee)
     and current_setting('saut.order_totals', true) is distinct from 'on' then
    raise exception 'Order totals are computed from items and cannot be edited directly';
  end if;
  return new;
end $$;

/**
 * create_order v2: same as before plus delivery. For fulfillment = 'delivery':
 *  - an address with at least area, block and house (or street) is required;
 *  - if the business has active zones, the order must be in one of them (by zone id, or by the
 *    address's area matching a zone name / its areas list); its fee is added and its minimum checked.
 * Totals are always computed here — never taken from the caller.
 */
drop function if exists create_order(uuid, jsonb, uuid, uuid, text, text, uuid, text);
create or replace function create_order(
  p_org uuid, p_items jsonb, p_customer uuid default null, p_conversation uuid default null,
  p_fulfillment text default 'pickup', p_notes text default null, p_agent uuid default null, p_status text default 'pending',
  p_address jsonb default null, p_zone uuid default null
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid; v_no int; v_sub numeric(12,3) := 0; it jsonb; p record; q int;
  z record; v_fee numeric(12,3) := 0; v_min numeric(12,3) := 0; v_zone uuid := null; v_area text; v_has_zones boolean; v_found boolean := false;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'An order needs at least one item'; end if;
  if jsonb_array_length(p_items) > 50 then raise exception 'Too many items'; end if;

  if p_fulfillment = 'delivery' then
    if p_address is null or jsonb_typeof(p_address) <> 'object'
       or coalesce(trim(p_address->>'area'), '') = '' or coalesce(trim(p_address->>'block'), '') = ''
       or (coalesce(trim(p_address->>'house'), '') = '' and coalesce(trim(p_address->>'street'), '') = '') then
      raise exception 'Delivery address incomplete: area, block and house or street are required';
    end if;
    v_area := lower(trim(p_address->>'area'));
    select exists (select 1 from delivery_zones where organization_id = p_org and is_active) into v_has_zones;
    if v_has_zones then
      if p_zone is not null then
        select * into z from delivery_zones where id = p_zone and organization_id = p_org and is_active;
      else
        select * into z from delivery_zones where organization_id = p_org and is_active
          and (lower(name) = v_area or v_area = any (select lower(a) from unnest(areas) a)) limit 1;
      end if;
      v_found := found;
      if not v_found then raise exception 'Outside delivery area'; end if;
      v_zone := z.id; v_fee := z.fee; v_min := z.min_order;
    end if;
  else
    p_address := null;
  end if;

  perform pg_advisory_xact_lock(hashtext('order_no:' || p_org::text));
  select coalesce(max(order_no), 1000) + 1 into v_no from orders where organization_id = p_org;
  insert into orders (organization_id, order_no, customer_id, conversation_id, fulfillment, notes, status, created_by_user, created_by_agent, delivery_address, delivery_zone_id)
  values (p_org, v_no, p_customer, p_conversation, p_fulfillment, p_notes, p_status, auth.uid(), p_agent, p_address, v_zone)
  returning id into v_id;
  for it in select * from jsonb_array_elements(p_items) loop
    q := (it->>'quantity')::int;
    if q is null or q < 1 or q > 999 then raise exception 'Invalid quantity'; end if;
    select id, name, price into p from products where id = (it->>'product_id')::uuid and organization_id = p_org and is_active;
    if not found then raise exception 'Product not available'; end if;
    insert into order_items (order_id, organization_id, product_id, name, unit_price, quantity, line_total)
    values (v_id, p_org, p.id, p.name, p.price, q, p.price * q);
    v_sub := v_sub + p.price * q;
  end loop;
  if v_zone is not null and v_sub < v_min then raise exception 'Below minimum order for this area: %', v_min; end if;
  perform set_config('saut.order_totals', 'on', true);
  update orders set subtotal = v_sub, delivery_fee = v_fee, total = v_sub + v_fee where id = v_id;
  perform set_config('saut.order_totals', 'off', true);
  return v_id;
end $$;
