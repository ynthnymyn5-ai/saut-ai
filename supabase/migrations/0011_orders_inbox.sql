-- ════════════════════════════════════════════════════════════════════════════
-- 0011 — Orders + products, inbox read state, support-ticket history
-- Additive and re-runnable. Prices and totals are computed IN THE DATABASE from the
-- product catalogue, never taken from the client or the AI.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Product catalogue ──────────────────────────────────────────────────────
create table if not exists products (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 160),
  description     text check (char_length(description) <= 1000),
  sku             text check (char_length(sku) <= 60),
  price           numeric(12,3) not null check (price >= 0 and price <= 100000),
  currency        text not null default 'KWD' check (currency ~ '^[A-Z]{3}$'),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists products_org_idx on products(organization_id, is_active, name);

-- ── Orders ────────────────────────────────────────────────────────────────
create table if not exists orders (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  order_no         int  not null,
  customer_id      uuid references customers(id) on delete set null,
  conversation_id  uuid references conversations(id) on delete set null,
  branch_id        uuid references branches(id) on delete set null,
  status           text not null default 'pending' check (status in ('pending','confirmed','preparing','ready','delivered','canceled')),
  fulfillment      text not null default 'pickup' check (fulfillment in ('pickup','delivery','dine_in')),
  subtotal         numeric(12,3) not null default 0 check (subtotal >= 0),
  total            numeric(12,3) not null default 0 check (total >= 0),
  currency         text not null default 'KWD',
  notes            text check (char_length(notes) <= 1000),
  created_by_user  uuid references users(id) on delete set null,
  created_by_agent uuid references ai_employees(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, order_no)
);
create index if not exists orders_org_idx on orders(organization_id, created_at desc);
create index if not exists orders_customer_idx on orders(customer_id);

create table if not exists order_items (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references orders(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  product_id      uuid references products(id) on delete set null,
  name            text not null,                     -- snapshot at order time
  unit_price      numeric(12,3) not null check (unit_price >= 0),
  quantity        int not null check (quantity between 1 and 999),
  line_total      numeric(12,3) not null check (line_total >= 0)
);
create index if not exists order_items_order_idx on order_items(order_id);

create table if not exists order_events (
  id              bigint generated always as identity primary key,
  order_id        uuid not null references orders(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  from_status     text,
  to_status       text not null,
  actor_user      uuid references users(id) on delete set null,
  created_at      timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['products','orders'] loop
    if not exists (select 1 from pg_trigger where tgname = 'trg_' || t || '_updated') then
      execute format('create trigger trg_%1$s_updated before update on %1$s for each row execute function set_updated_at()', t);
    end if;
  end loop;
end $$;

-- status history (who changed what, when)
create or replace function log_order_status() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into order_events (order_id, organization_id, from_status, to_status, actor_user)
    values (new.id, new.organization_id, case when tg_op = 'UPDATE' then old.status end, new.status, auth.uid());
  end if;
  return new;
end $$;
drop trigger if exists trg_orders_status_log on orders;
create trigger trg_orders_status_log after insert or update of status on orders for each row execute function log_order_status();

-- totals can only change through items (no client-side price tampering)
create or replace function protect_order_totals() returns trigger language plpgsql as $$
begin
  if (new.subtotal, new.total) is distinct from (old.subtotal, old.total) and current_setting('saut.order_totals', true) is distinct from 'on' then
    raise exception 'Order totals are computed from items and cannot be edited directly';
  end if;
  return new;
end $$;
drop trigger if exists trg_orders_protect_totals on orders;
create trigger trg_orders_protect_totals before update on orders for each row execute function protect_order_totals();

/**
 * Creates an order atomically. Prices come from the products table (active, same org);
 * the caller only chooses products and quantities. SECURITY INVOKER: the caller's RLS
 * applies, so only members who may operate this organization can create orders.
 * p_items: [{"product_id": uuid, "quantity": int}]
 */
create or replace function create_order(
  p_org uuid, p_items jsonb, p_customer uuid default null, p_conversation uuid default null,
  p_fulfillment text default 'pickup', p_notes text default null, p_agent uuid default null, p_status text default 'pending'
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid; v_no int; v_sub numeric(12,3) := 0; it jsonb; p record; q int; n int := 0;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'An order needs at least one item'; end if;
  if jsonb_array_length(p_items) > 50 then raise exception 'Too many items'; end if;
  perform pg_advisory_xact_lock(hashtext('order_no:' || p_org::text));
  select coalesce(max(order_no), 1000) + 1 into v_no from orders where organization_id = p_org;
  insert into orders (organization_id, order_no, customer_id, conversation_id, fulfillment, notes, status, created_by_user, created_by_agent)
  values (p_org, v_no, p_customer, p_conversation, p_fulfillment, p_notes, p_status, auth.uid(), p_agent)
  returning id into v_id;
  for it in select * from jsonb_array_elements(p_items) loop
    q := (it->>'quantity')::int;
    if q is null or q < 1 or q > 999 then raise exception 'Invalid quantity'; end if;
    select id, name, price into p from products where id = (it->>'product_id')::uuid and organization_id = p_org and is_active;
    if not found then raise exception 'Product not available'; end if;
    insert into order_items (order_id, organization_id, product_id, name, unit_price, quantity, line_total)
    values (v_id, p_org, p.id, p.name, p.price, q, p.price * q);
    v_sub := v_sub + p.price * q; n := n + 1;
  end loop;
  perform set_config('saut.order_totals', 'on', true);
  update orders set subtotal = v_sub, total = v_sub where id = v_id;
  perform set_config('saut.order_totals', 'off', true);
  return v_id;
end $$;

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table products     enable row level security;
alter table orders       enable row level security;
alter table order_items  enable row level security;
alter table order_events enable row level security;

drop policy if exists products_read on products;      create policy products_read  on products for select using (is_member(organization_id) or is_platform_admin());
drop policy if exists products_write on products;     create policy products_write on products for all using (can_manage_ai(organization_id)) with check (can_manage_ai(organization_id));
drop policy if exists orders_read on orders;          create policy orders_read    on orders for select using ((is_member(organization_id) and can_access_branch(organization_id, branch_id)) or is_platform_admin());
drop policy if exists orders_insert on orders;        create policy orders_insert  on orders for insert with check (can_operate(organization_id));
drop policy if exists orders_update on orders;        create policy orders_update  on orders for update using (can_operate(organization_id) and can_access_branch(organization_id, branch_id)) with check (can_operate(organization_id));
drop policy if exists order_items_read on order_items;   create policy order_items_read   on order_items for select using (is_member(organization_id) or is_platform_admin());
drop policy if exists order_items_insert on order_items; create policy order_items_insert on order_items for insert with check (can_operate(organization_id) and exists (select 1 from orders o where o.id = order_id and o.organization_id = order_items.organization_id));
drop policy if exists order_events_read on order_events; create policy order_events_read  on order_events for select using (is_member(organization_id) or is_platform_admin());
-- no delete policies: orders are cancelled, never deleted (history is kept)

-- ── Inbox: read state ─────────────────────────────────────────────────────
alter table conversations add column if not exists staff_read_at timestamptz;
create index if not exists conversations_inbox_idx on conversations(organization_id, last_activity_at desc);

-- ── Customer data deletion (right to erasure) ─────────────────────────────
/**
 * Erases one customer's personal data inside an organization: messages, notes, memory,
 * tags, leads; conversations/appointments/orders are kept for the business's records but
 * unlinked and anonymised. Owner/admin only (checked here — SECURITY DEFINER).
 */
create or replace function erase_customer(p_org uuid, p_customer uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_convs uuid[]; v_msgs int; begin
  if not (has_org_role(p_org, '{owner,admin}') or is_platform_admin()) then raise exception 'Only owners and admins can erase customer data'; end if;
  if not exists (select 1 from customers where id = p_customer and organization_id = p_org) then raise exception 'Customer not found'; end if;
  select coalesce(array_agg(id), '{}') into v_convs from conversations where organization_id = p_org and customer_id = p_customer;
  delete from messages where organization_id = p_org and conversation_id = any(v_convs);
  get diagnostics v_msgs = row_count;
  update conversations set summary = null, intent = null, customer_id = null where organization_id = p_org and id = any(v_convs);
  delete from agent_memory where organization_id = p_org and customer_id = p_customer;
  delete from customer_notes where organization_id = p_org and customer_id = p_customer;
  delete from customer_tag_links where customer_id = p_customer;
  delete from leads where organization_id = p_org and customer_id = p_customer;
  update appointments set customer_id = null, notes = null where organization_id = p_org and customer_id = p_customer;
  update orders set customer_id = null, notes = null where organization_id = p_org and customer_id = p_customer;
  update calls set from_number = 'erased', recording_url = null where organization_id = p_org and conversation_id = any(v_convs);
  delete from customers where id = p_customer and organization_id = p_org;
  insert into audit_logs (organization_id, actor_id, action, target_type, target_id, metadata)
  values (p_org, auth.uid(), 'customer.erased', 'customer', p_customer::text, jsonb_build_object('conversations', coalesce(array_length(v_convs, 1), 0), 'messages', v_msgs));
  return jsonb_build_object('conversations', coalesce(array_length(v_convs, 1), 0), 'messages', v_msgs);
end $$;
revoke all on function erase_customer(uuid, uuid) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then grant execute on function erase_customer(uuid, uuid) to authenticated; end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then revoke all on function erase_customer(uuid, uuid) from anon; end if;
end $$;
