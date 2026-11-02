-- 0016: security hardening (found in the November 2026 review). Non-destructive: no data is deleted or changed.
-- If a unique index below fails, two businesses already share a widget key / number — fix that row first.

-- 1) A suspended business could re-activate itself by writing organizations.status directly
--    through the public API. Only platform admins (or the server) may change these columns.
-- Runs as the caller (not security definer) so current_user tells a browser/API request
-- ('authenticated'/'anon') apart from the server key and from create_organization().
create or replace function protect_org_columns() returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and not is_platform_admin() then
    if tg_op = 'INSERT' then
      raise exception 'Create businesses through onboarding' using errcode = '42501';
    end if;
    if new.status is distinct from old.status or new.is_demo is distinct from old.is_demo or new.created_by is distinct from old.created_by then
      raise exception 'Not allowed to change this field' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_protect_org_columns on organizations;
create trigger trg_protect_org_columns before insert or update on organizations for each row execute function protect_org_columns();
-- Businesses are created only by create_organization() (which enforces the per-user limit).
drop policy if exists org_insert on organizations;

-- 2) Integrations decide where inbound WhatsApp messages, calls and website chats are routed.
--    Writing them directly let one business claim another's number or widget key.
--    From now on only the server writes them, after verifying with the provider.
drop policy if exists integ_write on integrations;

create unique index if not exists integrations_widget_key_uniq on integrations ((config->>'key')) where provider = 'web_widget' and config ? 'key';
create unique index if not exists integrations_whatsapp_number_uniq on integrations ((config->>'phone_number_id')) where provider = 'whatsapp' and status = 'connected' and config ? 'phone_number_id';
create unique index if not exists integrations_telephony_number_uniq on integrations ((config->>'number')) where provider = 'telephony' and status = 'connected' and config ? 'number';

-- 3) Calls are routed by ai_employees.phone_number (already unique).
--    Only the server (after checking the number on the Twilio account) may set it.
create or replace function protect_employee_number() returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and not is_platform_admin()
     and ((tg_op = 'INSERT' and new.phone_number is not null) or (tg_op = 'UPDATE' and new.phone_number is distinct from old.phone_number)) then
    raise exception 'Phone numbers are connected from Integrations' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists trg_protect_employee_number on ai_employees;
create trigger trg_protect_employee_number before insert or update on ai_employees for each row execute function protect_employee_number();

-- 4) Maintenance-only function was callable by anyone with the public key.
revoke execute on function purge_expired_conversations() from public, anon, authenticated;
revoke execute on function expire_lapsed_subscriptions(interval, interval) from public, anon, authenticated;
revoke execute on function vault_store_secret(text, text) from public, anon;
