-- Tickmarkin: secured server access (run once in Supabase → SQL Editor).
-- Contains only the SHA-256 fingerprint of the server secret, never the secret itself.
create table if not exists public.tm_config (key text primary key, value text not null);
alter table public.tm_config enable row level security;
revoke all on public.tm_config from anon, authenticated;
insert into public.tm_config (key, value)
values ('api_secret_sha256', '42610c4c6b735d01c8d45c01576ab8afae302d534cfc6e758c7f9d2ba88828d2')
on conflict (key) do update set value = excluded.value;

create or replace function public.tm_api(
  p_secret text, p_op text, p_collection text, p_id text default null, p_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hash text;
  v_table text;
  v_cols text;
  v_result jsonb;
begin
  select value into v_hash from public.tm_config where key = 'api_secret_sha256';
  if v_hash is null or encode(sha256(convert_to(coalesce(p_secret, ''), 'UTF8')), 'hex') <> v_hash then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_table := case p_collection
    when 'registrations' then 'tm_registrations' when 'messages' then 'tm_messages'
    when 'teachers' then 'tm_teachers' when 'classes' then 'tm_classes'
    when 'students' then 'tm_students' when 'fees' then 'tm_fees' when 'payments' then 'tm_payments'
  end;
  if v_table is null then raise exception 'unknown collection' using errcode = '22023'; end if;

  if p_op in ('add', 'update') then
    select string_agg(quote_ident(c.column_name), ',' order by c.ordinal_position) into v_cols
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = v_table
      and p_payload ? c.column_name
      and not (p_op = 'update' and c.column_name = 'id');
    if v_cols is null then raise exception 'empty payload' using errcode = '22023'; end if;
  end if;

  if p_op = 'list' then
    execute format('select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), ''[]''::jsonb) from %I t', v_table) into v_result;
  elsif p_op = 'add' then
    execute format('insert into %I (%s) select %s from jsonb_populate_record(null::%I, $1) returning to_jsonb(%I.*)',
      v_table, v_cols, v_cols, v_table, v_table) using p_payload into v_result;
  elsif p_op = 'update' then
    execute format('update %I set (%s) = (select %s from jsonb_populate_record(null::%I, $1)) where id = $2 returning to_jsonb(%I.*)',
      v_table, v_cols, v_cols, v_table, v_table) using p_payload, p_id into v_result;
  elsif p_op = 'remove' then
    execute format('delete from %I where id = $1 returning to_jsonb(%I.*)', v_table, v_table) using p_id into v_result;
  else
    raise exception 'unknown op' using errcode = '22023';
  end if;
  return v_result;
end;
$$;

revoke all on function public.tm_api(text, text, text, text, jsonb) from public;
grant execute on function public.tm_api(text, text, text, text, jsonb) to anon;
